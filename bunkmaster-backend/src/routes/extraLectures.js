const express = require("express");
const { body, validationResult } = require("express-validator");
const prisma = require("../utils/prisma");
const { requireAuth, requireSectionRole } = require("../middleware/auth");
const { dateOnly } = require("../utils/attendanceSync");

const router = express.Router({ mergeParams: true });

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
  } catch (err) { next(err); }
});

/**
 * POST /sections/:sectionId/extra-lectures
 * CR/SR only: log an extra lecture AND take attendance.
 * Avoids long-running transactions by doing upsert + attendance outside transaction.
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

      // Validate subject belongs to section
      const subject = await prisma.subject.findFirst({ where: { id: subjectId, sectionId } });
      if (!subject) return res.status(400).json({ error: "subjectId is invalid for this section" });

      // Validate all userIds are section members
      const memberIds = new Set(
        (await prisma.sectionMembership.findMany({ where: { sectionId }, select: { userId: true } }))
          .map((m) => m.userId)
      );
      const invalid = attendance.filter((a) => !memberIds.has(a.userId));
      if (invalid.length > 0) {
        return res.status(400).json({
          error: "Some userIds are not members of this section",
          invalidUserIds: [...new Set(invalid.map((a) => a.userId))],
        });
      }

      // Upsert the extra lecture record (outside transaction — fast single operation)
      const extra = await prisma.extraLecture.upsert({
        where: { sectionId_subjectId_date: { sectionId, subjectId, date: targetDate } },
        update: { reason: reason || null },
        create: { sectionId, subjectId, date: targetDate, reason: reason || null, createdById: req.user.id },
      });

      // Process attendance records one by one outside transaction
      // (avoids transaction timeout with large class sizes)
      let created = 0, updated = 0;

      for (const entry of attendance) {
        const existing = await prisma.attendanceRecord.findFirst({
          where: { userId: entry.userId, subjectId, date: targetDate, timetableSlotId: null },
        });

        if (existing) {
          await prisma.attendanceRecord.update({
            where: { id: existing.id },
            data:  { status: entry.status },
          });
          updated++;
        } else {
          await prisma.attendanceRecord.create({
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

      res.status(201).json({
        extraLecture:       extra,
        attendanceCreated:  created,
        attendanceUpdated:  updated,
      });
    } catch (err) { next(err); }
  }
);

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

      // Delete attendance records first, then extra lecture
      await prisma.attendanceRecord.deleteMany({
        where: { subjectId: extra.subjectId, date: extra.date, timetableSlotId: null },
      });
      await prisma.extraLecture.delete({ where: { id: extra.id } });

      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
