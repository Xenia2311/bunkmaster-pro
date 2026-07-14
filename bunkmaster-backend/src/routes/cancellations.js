const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const prisma = require("../utils/prisma");
const { requireAuth, requireSectionRole } = require("../middleware/auth");
const { syncAttendanceForSection, dateOnly, toDateKey } = require("../utils/attendanceSync");

const router = express.Router({ mergeParams: true });
const DEFAULT_RESCHEDULE_WINDOW_DAYS = 14;
const MAX_RESCHEDULE_WINDOW_DAYS = 60;

router.get(
  "/",
  requireAuth,
  requireSectionRole(null),
  [query("from").optional().isISO8601(), query("to").optional().isISO8601()],
  async (req, res, next) => {
    try {
      const { from, to } = req.query;
      const where = { sectionId: req.params.sectionId };
      if (from || to) {
        where.date = {};
        if (from) where.date.gte = dateOnly(from);
        if (to)   where.date.lte = dateOnly(to);
      }
      const cancellations = await prisma.cancellation.findMany({
        where,
        include: {
          subject:       { select: { id: true, name: true } },
          timetableSlot: { select: { id: true, dayOfWeek: true, slotIndex: true } },
        },
        orderBy: { date: "asc" },
      });
      res.json({ cancellations });
    } catch (err) { next(err); }
  }
);

/**
 * POST /sections/:sectionId/cancellations
 * CR/SR: mark a lecture/lab as cancelled.
 * If the slot has a paired lab (isLabPair=true), auto-cancel the next slot too.
 */
router.post(
  "/",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("date").isISO8601().withMessage("date must be YYYY-MM-DD"),
    body("timetableSlotId").isString().notEmpty(),
    body("subjectId").isString().notEmpty(),
    body("reason").optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const sectionId = req.params.sectionId;
      const { date, timetableSlotId, subjectId, reason } = req.body;
      const targetDate = dateOnly(date);

      const slot = await prisma.timetableSlot.findFirst({
        where: { id: timetableSlotId, sectionId },
        include: { labSlots: true },
      });
      if (!slot) return res.status(400).json({ error: "timetableSlotId is invalid for this section" });
      if (slot.isBreak) return res.status(400).json({ error: "Cannot cancel a break slot" });

      const subject = await prisma.subject.findFirst({ where: { id: subjectId, sectionId } });
      if (!subject) return res.status(400).json({ error: "subjectId is invalid for this section" });

      const existing = await prisma.cancellation.findFirst({
        where: { sectionId, date: targetDate, timetableSlotId, subjectId },
      });
      if (existing) {
        return res.status(409).json({ error: "This lecture is already marked as cancelled", cancellation: existing });
      }

      // Create the cancellation
      const cancellation = await prisma.cancellation.create({
        data: { sectionId, date: targetDate, timetableSlotId, subjectId, reason: reason || null, status: "cancelled", createdById: req.user.id },
      });

      // Auto-cancel paired lab slot (next slot) if this lab has isLabPair=true
      const pairedLabSlot = slot.labSlots.find((l) => l.subjectId === subjectId && l.isLabPair);
      let pairedCancellation = null;

      if (pairedLabSlot) {
        // Find the next slot
        const nextSlot = await prisma.timetableSlot.findUnique({
          where: {
            sectionId_dayOfWeek_slotIndex: {
              sectionId,
              dayOfWeek: slot.dayOfWeek,
              slotIndex: slot.slotIndex + 1,
            },
          },
        });

        if (nextSlot && !nextSlot.isBreak) {
          const nextExisting = await prisma.cancellation.findFirst({
            where: { sectionId, date: targetDate, timetableSlotId: nextSlot.id, subjectId },
          });
          if (!nextExisting) {
            pairedCancellation = await prisma.cancellation.create({
              data: {
                sectionId,
                date:           targetDate,
                timetableSlotId: nextSlot.id,
                subjectId,
                reason:         reason ? `${reason} (paired lab slot)` : "Paired lab slot",
                status:         "cancelled",
                createdById:    req.user.id,
              },
            });
          }
        }
      }

      // Re-sync that date so AttendanceRecords flip to cancelled
      await resyncDateCancellations(sectionId, targetDate);

      res.status(201).json({ cancellation, pairedCancellation });
    } catch (err) { next(err); }
  }
);

async function resyncDateCancellations(sectionId, targetDate) {
  const cancellations = await prisma.cancellation.findMany({
    where: { sectionId, date: targetDate, status: "cancelled" },
    select: { timetableSlotId: true, subjectId: true },
  });

  for (const c of cancellations) {
    await prisma.attendanceRecord.updateMany({
      where: { date: targetDate, timetableSlotId: c.timetableSlotId, subjectId: c.subjectId, status: "not_yet_occurred" },
      data:  { status: "cancelled" },
    });
  }

  await syncAttendanceForSection(sectionId, targetDate, targetDate);
}

router.get(
  "/:cancellationId/reschedule-options",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [query("days").optional().isInt({ min: 1, max: MAX_RESCHEDULE_WINDOW_DAYS })],
  async (req, res, next) => {
    try {
      const sectionId  = req.params.sectionId;
      const windowDays = req.query.days ? Number(req.query.days) : DEFAULT_RESCHEDULE_WINDOW_DAYS;

      const cancellation = await prisma.cancellation.findFirst({
        where: { id: req.params.cancellationId, sectionId },
        include: { subject: { select: { id: true, name: true } } },
      });
      if (!cancellation) return res.status(404).json({ error: "Cancellation not found" });
      if (cancellation.status === "rescheduled") {
        return res.status(400).json({ error: "Already rescheduled", rescheduledDate: cancellation.rescheduledDate });
      }

      const today = dateOnly(new Date());
      const searchStart = new Date(today); searchStart.setUTCDate(searchStart.getUTCDate() + 1);
      const searchEnd   = new Date(searchStart); searchEnd.setUTCDate(searchEnd.getUTCDate() + windowDays - 1);

      const timetableSlots = await prisma.timetableSlot.findMany({
        where: { sectionId, isBreak: false },
        include: {
          subject:  { select: { id: true, name: true } },
          labSlots: { include: { subject: { select: { id: true, name: true } } } },
        },
        orderBy: [{ dayOfWeek: "asc" }, { slotIndex: "asc" }],
      });

      const slotsByDay = new Map();
      for (const slot of timetableSlots) {
        if (!slotsByDay.has(slot.dayOfWeek)) slotsByDay.set(slot.dayOfWeek, []);
        slotsByDay.get(slot.dayOfWeek).push(slot);
      }

      const holidays = await prisma.holidayCalendar.findMany({
        where: { sectionId, date: { gte: searchStart, lte: searchEnd } },
        select: { date: true },
      });
      const holidayKeys = new Set(holidays.map((h) => toDateKey(h.date)));

      const existingReschedules = await prisma.cancellation.findMany({
        where: { sectionId, status: "rescheduled", rescheduledDate: { gte: searchStart, lte: searchEnd } },
        select: { rescheduledDate: true, rescheduledTimetableSlotId: true },
      });
      const rescheduleKeys = new Set(
        existingReschedules.map((r) => `${toDateKey(r.rescheduledDate)}|${r.rescheduledTimetableSlotId}`)
      );

      const options = [];

      for (let d = new Date(searchStart); d <= searchEnd; d.setUTCDate(d.getUTCDate() + 1)) {
        const current  = new Date(d);
        const dateKey  = toDateKey(current);
        const jsDay    = current.getUTCDay();
        if (jsDay === 0 || jsDay === 6) continue;
        const dayOfWeek = jsDay - 1;
        if (holidayKeys.has(dateKey)) continue;

        const daySlots = slotsByDay.get(dayOfWeek) || [];
        for (const slot of daySlots) {
          if (rescheduleKeys.has(`${dateKey}|${slot.id}`)) continue;
          const lectureEmpty  = !slot.subjectId;
          const allLabsEmpty  = slot.labSlots.length > 0 && slot.labSlots.every((l) => !l.subjectId);
          const noLabsConfig  = slot.labSlots.length === 0;
          const fullyEmpty    = lectureEmpty && (noLabsConfig || allLabsEmpty);
          if (fullyEmpty) {
            options.push({
              date: dateKey, dayOfWeek: slot.dayOfWeek, slotIndex: slot.slotIndex,
              timetableSlotId: slot.id, type: "full_slot",
              note: "Free slot — suitable for a makeup lecture.",
            });
          }
        }
      }

      res.json({
        cancellation: { id: cancellation.id, date: toDateKey(cancellation.date), subject: cancellation.subject, reason: cancellation.reason },
        searchWindow: { from: toDateKey(searchStart), to: toDateKey(searchEnd) },
        options,
      });
    } catch (err) { next(err); }
  }
);

router.post(
  "/:cancellationId/reschedule",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("date").isISO8601().withMessage("date must be YYYY-MM-DD"),
    body("timetableSlotId").isString().notEmpty(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const sectionId = req.params.sectionId;
      const { date, timetableSlotId } = req.body;
      const rescheduledDate = dateOnly(date);

      const cancellation = await prisma.cancellation.findFirst({
        where: { id: req.params.cancellationId, sectionId },
      });
      if (!cancellation) return res.status(404).json({ error: "Cancellation not found" });
      if (cancellation.status === "rescheduled") return res.status(409).json({ error: "Already rescheduled" });

      const targetSlot = await prisma.timetableSlot.findFirst({
        where: { id: timetableSlotId, sectionId },
        include: { labSlots: true },
      });
      if (!targetSlot) return res.status(400).json({ error: "timetableSlotId is invalid" });
      if (targetSlot.isBreak) return res.status(400).json({ error: "Cannot reschedule into a break slot" });

      const conflict = await prisma.cancellation.findFirst({
        where: { sectionId, status: "rescheduled", rescheduledDate, rescheduledTimetableSlotId: timetableSlotId },
      });
      if (conflict) return res.status(409).json({ error: "This date+slot is already used for another reschedule" });

      const updated = await prisma.cancellation.update({
        where: { id: cancellation.id },
        data:  { status: "rescheduled", rescheduledDate, rescheduledTimetableSlotId: timetableSlotId },
      });

      const memberships = await prisma.sectionMembership.findMany({
        where: { sectionId },
        select: { userId: true },
      });

      if (memberships.length > 0) {
        await prisma.attendanceRecord.createMany({
          data: memberships.map((m) => ({
            userId:          m.userId,
            subjectId:       cancellation.subjectId,
            date:            rescheduledDate,
            timetableSlotId: targetSlot.id,
            status:          "not_yet_occurred",
          })),
          skipDuplicates: true,
        });
      }

      res.json({ cancellation: updated, affectedStudents: memberships.length });
    } catch (err) { next(err); }
  }
);

module.exports = router;

/**
 * DELETE /sections/:sectionId/cancellations/:cancellationId
 * CR/SR only: remove a cancellation (undo it).
 * Flips affected AttendanceRecords back from "cancelled" to "not_yet_occurred".
 * Only works for cancellations that haven't been rescheduled yet.
 */
router.delete(
  "/:cancellationId",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  async (req, res, next) => {
    try {
      const cancellation = await prisma.cancellation.findFirst({
        where: { id: req.params.cancellationId, sectionId: req.params.sectionId },
      });
      if (!cancellation) return res.status(404).json({ error: "Cancellation not found" });

      if (cancellation.status === "rescheduled") {
        return res.status(400).json({
          error: "This cancellation has already been rescheduled. Delete the reschedule first.",
        });
      }

      const targetDate = cancellation.date;

      // Flip AttendanceRecords back to not_yet_occurred
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const isPast = new Date(targetDate) < today;

      await prisma.attendanceRecord.updateMany({
        where: {
          timetableSlotId: cancellation.timetableSlotId,
          subjectId:       cancellation.subjectId,
          date:            targetDate,
          status:          "cancelled",
        },
        // If the date is in the past, revert to "missed" (not_yet_occurred would be wrong)
        // If it's today or future, revert to "not_yet_occurred"
        data: { status: isPast ? "missed" : "not_yet_occurred" },
      });

      await prisma.cancellation.delete({ where: { id: cancellation.id } });

      res.json({ success: true, message: "Cancellation removed. Attendance records restored." });
    } catch (err) { next(err); }
  }
);
