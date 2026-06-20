const express = require("express");
const { body, validationResult } = require("express-validator");
const prisma = require("../utils/prisma");
const { requireAuth, requireSectionRole } = require("../middleware/auth");
const { dateOnly } = require("../utils/attendanceSync");

const router = express.Router({ mergeParams: true });

/**
 * GET /sections/:sectionId/extra-lectures
 * Any member — list extra lectures for this section.
 */
router.get("/", requireAuth, requireSectionRole(null), async (req, res, next) => {
  try {
    const extras = await prisma.extraLecture.findMany({
      where: { sectionId: req.params.sectionId },
      include: {
        subject:   { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });
    res.json({ extraLectures: extras });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /sections/:sectionId/extra-lectures
 * CR/SR only: log an extra lecture AND take attendance in one shot.
 *
 * body: {
 *   date: "YYYY-MM-DD",
 *   subjectId: string,
 *   reason?: string,
 *   attendance: [{ userId, status: "attended"|"missed" }]
 * }
 */
router.post(
  "/",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("date").isISO8601().withMessage("date must be YYYY-MM-DD"),
    body("subjectId").isString().notEmpty(),
    body("reason").optional().isString(),
    body("attendance").isArray({ min: 1 }).withMessage("attendance must be a non-empty array"),
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

      // Validate subject belongs to section
      const subject = await prisma.subject.findFirst({
        where: { id: subjectId, sectionId },
      });
      if (!subject) {
        return res.status(400).json({ error: "subjectId is invalid for this section" });
      }

      // Validate all userIds are section members
      const memberIds = new Set(
        (await prisma.sectionMembership.findMany({
          where: { sectionId },
          select: { userId: true },
        })).map((m) => m.userId)
      );
      const invalid = attendance.filter((a) => !memberIds.has(a.userId));
      if (invalid.length > 0) {
        return res.status(400).json({
          error: "Some userIds are not members of this section",
          invalidUserIds: [...new Set(invalid.map((a) => a.userId))],
        });
      }

      // Create the extra lecture record + attendance records in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Upsert the extra lecture (safe to call multiple times for same date/subject)
        const extra = await tx.extraLecture.upsert({
          where: {
            sectionId_subjectId_date: { sectionId, subjectId, date: targetDate },
          },
          update: { reason: reason || null },
          create: {
            sectionId,
            subjectId,
            date:        targetDate,
            reason:      reason || null,
            createdById: req.user.id,
          },
        });

        // Create/update attendance records
        // We use a synthetic timetableSlotId of null since this isn't a
        // regular timetable slot — we use the extraLectureId as a stable key
        // by storing it in the notes via a workaround: we use a special
        // sentinel timetableSlotId. Instead, we just upsert without slotId.
        let created = 0, updated = 0;
        for (const entry of attendance) {
          const existing = await tx.attendanceRecord.findFirst({
            where: {
              userId:           entry.userId,
              subjectId,
              date:             targetDate,
              timetableSlotId:  null,
            },
          });

          if (existing) {
            await tx.attendanceRecord.update({
              where: { id: existing.id },
              data:  { status: entry.status },
            });
            updated++;
          } else {
            await tx.attendanceRecord.create({
              data: {
                userId:          entry.userId,
                subjectId,
                date:            targetDate,
                timetableSlotId: null,
                status:          entry.status,
              },
            });
            created++;
          }
        }

        return { extra, created, updated };
      });

      res.status(201).json({
        extraLecture: result.extra,
        attendanceCreated: result.created,
        attendanceUpdated: result.updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /sections/:sectionId/extra-lectures/:extraLectureId
 * CR/SR only. Also removes the associated attendance records.
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

      await prisma.$transaction(async (tx) => {
        // Remove the attendance records for this extra lecture
        await tx.attendanceRecord.deleteMany({
          where: {
            subjectId:       extra.subjectId,
            date:            extra.date,
            timetableSlotId: null,
          },
        });
        await tx.extraLecture.delete({ where: { id: extra.id } });
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
