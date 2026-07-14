const express = require("express");
const { body, validationResult } = require("express-validator");
const prisma = require("../utils/prisma");
const { requireAuth, requireSectionRole } = require("../middleware/auth");
const { dateOnly } = require("../utils/attendanceSync");

const router = express.Router({ mergeParams: true });

/**
 * GET /sections/:sectionId/extra-lectures
 * List all extra lectures with attendance summary.
 */
router.get("/", requireAuth, requireSectionRole(null), async (req, res, next) => {
  try {
    const sectionId = req.params.sectionId;

    const extras = await prisma.extraLecture.findMany({
      where: { sectionId },
      include: {
        subject:   { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });

    // Attach attendance summary for each extra lecture
    const extrasWithAttendance = await Promise.all(
      extras.map(async (extra) => {
        const records = await prisma.attendanceRecord.findMany({
          where: {
            subjectId:       extra.subjectId,
            date:            extra.date,
            timetableSlotId: null,
          },
          include: {
            user: { select: { id: true, name: true } },
          },
        });

        // Get roll numbers from memberships
        const memberships = await prisma.sectionMembership.findMany({
          where: { sectionId, userId: { in: records.map((r) => r.userId) } },
          select: { userId: true, rollNumber: true, batchNumber: true },
        });
        const memberMap = Object.fromEntries(memberships.map((m) => [m.userId, m]));

        const attendance = records
          .map((r) => ({
            recordId:   r.id,
            userId:     r.userId,
            name:       r.user.name,
            rollNumber: memberMap[r.userId]?.rollNumber ?? null,
            batchNumber: memberMap[r.userId]?.batchNumber ?? null,
            status:     r.status,
          }))
          .sort((a, b) => {
            if (a.rollNumber !== null && b.rollNumber !== null) return a.rollNumber - b.rollNumber;
            if (a.rollNumber !== null) return -1;
            if (b.rollNumber !== null) return 1;
            const sA = a.name.trim().split(/\s+/).pop().toLowerCase();
            const sB = b.name.trim().split(/\s+/).pop().toLowerCase();
            return sA.localeCompare(sB);
          });

        const attended = attendance.filter((r) => r.status === "attended").length;

        return {
          id:          extra.id,
          date:        extra.date,
          subject:     extra.subject,
          reason:      extra.reason,
          createdBy:   extra.createdBy,
          attendance,
          summary: {
            total:    attendance.length,
            attended,
            missed:   attendance.filter((r) => r.status === "missed").length,
          },
        };
      })
    );

    res.json({ extraLectures: extrasWithAttendance });
  } catch (err) { next(err); }
});

/**
 * POST /sections/:sectionId/extra-lectures
 * CR/SR: log an extra lecture and take attendance in one shot.
 * Uses createMany + updateMany for speed instead of per-record loops.
 */
router.post(
  "/",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("date").isISO8601().withMessage("date must be YYYY-MM-DD"),
    body("subjectId").isString().notEmpty(),
    body("reason").optional().isString(),
    body("attendance").isArray({ min: 1 }),
    body("attendance.*.userId").isString().notEmpty(),
    body("attendance.*.status").isIn(["attended", "missed"]),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { date, subjectId, reason, attendance } = req.body;
      const sectionId  = req.params.sectionId;
      const targetDate = dateOnly(date);

      const subject = await prisma.subject.findFirst({ where: { id: subjectId, sectionId } });
      if (!subject) return res.status(400).json({ error: "subjectId is invalid for this section" });

      const memberIds = new Set(
        (await prisma.sectionMembership.findMany({
          where: { sectionId }, select: { userId: true },
        })).map((m) => m.userId)
      );
      const invalid = attendance.filter((a) => !memberIds.has(a.userId));
      if (invalid.length > 0) {
        return res.status(400).json({ error: "Some userIds are not members of this section" });
      }

      // Upsert the extra lecture record
      const extra = await prisma.extraLecture.upsert({
        where:  { sectionId_subjectId_date: { sectionId, subjectId, date: targetDate } },
        update: { reason: reason || null },
        create: { sectionId, subjectId, date: targetDate, reason: reason || null, createdById: req.user.id },
      });

      // Find existing records for this extra lecture
      const existing = await prisma.attendanceRecord.findMany({
        where: { subjectId, date: targetDate, timetableSlotId: null },
        select: { id: true, userId: true, status: true },
      });
      const existingMap = new Map(existing.map((r) => [r.userId, r]));

      // Split into creates and updates
      const toCreate  = [];
      const toUpdate  = [];

      for (const entry of attendance) {
        const rec = existingMap.get(entry.userId);
        if (rec) {
          if (rec.status !== entry.status) {
            toUpdate.push({ id: rec.id, status: entry.status });
          }
        } else {
          toCreate.push({
            userId:          entry.userId,
            subjectId,
            date:            targetDate,
            timetableSlotId: null,
            status:          entry.status,
            markedByCR:      true,
          });
        }
      }

      // Batch create
      let created = 0;
      if (toCreate.length > 0) {
        const result = await prisma.attendanceRecord.createMany({
          data:            toCreate,
          skipDuplicates:  true,
        });
        created = result.count;
      }

      // Batch update (Prisma doesn't support bulk update with different values,
      // so we update in parallel — much faster than sequential)
      if (toUpdate.length > 0) {
        await Promise.all(
          toUpdate.map((u) =>
            prisma.attendanceRecord.update({
              where: { id: u.id },
              data:  { status: u.status, markedByCR: true },
            })
          )
        );
      }

      res.status(201).json({
        extraLecture: extra,
        created,
        updated: toUpdate.length,
        total:   attendance.length,
      });
    } catch (err) { next(err); }
  }
);

/**
 * PATCH /sections/:sectionId/extra-lectures/:extraLectureId/attendance
 * CR/SR: update a single attendance record for an extra lecture.
 * body: { recordId, status }
 */
router.patch(
  "/:extraLectureId/attendance",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("recordId").isString().notEmpty(),
    body("status").isIn(["attended", "missed"]),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { recordId, status } = req.body;

      const record = await prisma.attendanceRecord.findUnique({ where: { id: recordId } });
      if (!record) return res.status(404).json({ error: "Attendance record not found" });

      const updated = await prisma.attendanceRecord.update({
        where: { id: recordId },
        data:  { status, markedByCR: true },
      });

      res.json({ record: updated });
    } catch (err) { next(err); }
  }
);

/**
 * DELETE /sections/:sectionId/extra-lectures/:extraLectureId
 * CR/SR: delete extra lecture and its attendance records.
 */
router.delete(
  "/:extraLectureId",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  async (req, res, next) => {
    try {
      const extra = await prisma.extraLecture.findFirst({
        where: { id: req.params.extraLectureId, sectionId: req.params.sectionId },
      });
      if (!extra) return res.status(404).json({ error: "Extra lecture not found" });

      await prisma.attendanceRecord.deleteMany({
        where: { subjectId: extra.subjectId, date: extra.date, timetableSlotId: null },
      });
      await prisma.extraLecture.delete({ where: { id: extra.id } });

      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
