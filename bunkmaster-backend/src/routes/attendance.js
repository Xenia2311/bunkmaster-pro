const express = require("express");
const { body, param, query, validationResult } = require("express-validator");

const prisma = require("../utils/prisma");
const { requireAuth, requireSectionRole, isClassAdmin } = require("../middleware/auth");
const {
  syncAttendanceForSection,
  syncAttendanceToToday,
  dateOnly,
} = require("../utils/attendanceSync");

const router = express.Router({ mergeParams: true });

// ─── POST /sync ───────────────────────────────────────────────
router.post(
  "/sync",
  requireAuth,
  requireSectionRole(null),
  [body("from").optional().isISO8601(), body("to").optional().isISO8601()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

      const { from, to } = req.body;
      const sectionId = req.params.sectionId;
      let result;

      if (from || to) {
        if (!isClassAdmin(req.membership.role)) {
          return res.status(403).json({ error: "Only CR/SR can specify a custom sync range" });
        }
        const section = await prisma.section.findUnique({ where: { id: sectionId }, select: { semesterStartDate: true } });
        const fromDate = from ? new Date(from) : section?.semesterStartDate;
        const toDate   = to   ? new Date(to)   : new Date();
        if (!fromDate) return res.status(400).json({ error: "No from date and section has no semesterStartDate" });
        result = await syncAttendanceForSection(sectionId, fromDate, toDate);
      } else {
        result = await syncAttendanceToToday(sectionId, null);
        if (result.skipped === "no_start_date") {
          return res.status(400).json({ error: "Section has no semesterStartDate set." });
        }
      }
      res.json({ synced: result });
    } catch (err) { next(err); }
  }
);

// ─── GET /stats ───────────────────────────────────────────────
router.get(
  "/stats",
  requireAuth,
  requireSectionRole(null),
  [query("target").optional().isFloat({ min: 0, max: 100 })],
  async (req, res, next) => {
    try {
      const sectionId = req.params.sectionId;
      const target    = req.query.target ? Number(req.query.target) : 75;

      const syncResult = await syncAttendanceToToday(sectionId, null);

      const subjects = await prisma.subject.findMany({
        where: { sectionId },
        select: { id: true, name: true, semesterTotal: true },
      });

      const records = await prisma.attendanceRecord.findMany({
        where: { userId: req.user.id, subjectId: { in: subjects.map((s) => s.id) } },
        select: { subjectId: true, status: true },
      });

      const stats = subjects.map((subject) => {
        const recs      = records.filter((r) => r.subjectId === subject.id);
        const conducted = recs.filter((r) => r.status === "attended" || r.status === "missed").length;
        const attended  = recs.filter((r) => r.status === "attended").length;
        const percentage = conducted > 0 ? (attended / conducted) * 100 : 0;

        let prediction;
        if (conducted === 0) {
          prediction = "No lectures conducted yet.";
        } else if (percentage >= target) {
          let canBunk = 0, a = attended, t = conducted;
          while (t < 100000 && (a / (t + 1)) * 100 >= target) { t++; canBunk++; }
          prediction = `Can bunk ${canBunk} more class${canBunk === 1 ? "" : "es"} & stay safe.`;
        } else {
          let need = 0, a = attended, t = conducted;
          while (t < 100000 && ((a + 1) / (t + 1)) * 100 < target) { a++; t++; need++; }
          need++;
          prediction = `Attend next ${need} class${need === 1 ? "" : "es"} to hit target.`;
        }

        let maxPossible = null;
        if (subject.semesterTotal) {
          const remaining = Math.max(subject.semesterTotal - conducted, 0);
          maxPossible = ((attended + remaining) / subject.semesterTotal) * 100;
        }

        return {
          subjectId: subject.id, name: subject.name, attended, conducted,
          percentage: Math.round(percentage * 10) / 10,
          semesterTotal: subject.semesterTotal,
          maxPossiblePercentage: maxPossible !== null ? Math.round(maxPossible * 10) / 10 : null,
          prediction,
        };
      });

      res.json({ target, stats, syncInfo: syncResult });
    } catch (err) { next(err); }
  }
);

// ─── GET /report ──────────────────────────────────────────────
router.get(
  "/report",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [query("target").optional().isFloat({ min: 0, max: 100 })],
  async (req, res, next) => {
    try {
      const sectionId = req.params.sectionId;
      const target    = req.query.target ? Number(req.query.target) : 75;

      const [memberships, subjects] = await Promise.all([
        prisma.sectionMembership.findMany({
          where:   { sectionId },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: [{ rollNumber: { sort: "asc", nulls: "last" } }, { user: { name: "asc" } }],
        }),
        prisma.subject.findMany({ where: { sectionId }, orderBy: { name: "asc" } }),
      ]);

      const subjectIds = subjects.map((s) => s.id);
      const userIds    = memberships.map((m) => m.userId);

      const records = await prisma.attendanceRecord.findMany({
        where:  { userId: { in: userIds }, subjectId: { in: subjectIds } },
        select: { userId: true, subjectId: true, status: true },
      });

      const recordsByUser = {};
      for (const r of records) {
        if (!recordsByUser[r.userId]) recordsByUser[r.userId] = {};
        if (!recordsByUser[r.userId][r.subjectId]) recordsByUser[r.userId][r.subjectId] = [];
        recordsByUser[r.userId][r.subjectId].push(r.status);
      }

      const rows = memberships.map((m) => {
        const subjectStats = subjects.map((sub) => {
          const statuses  = recordsByUser[m.userId]?.[sub.id] || [];
          const conducted = statuses.filter((s) => s === "attended" || s === "missed").length;
          const attended  = statuses.filter((s) => s === "attended").length;
          const percentage = conducted > 0 ? Math.round((attended / conducted) * 1000) / 10 : null;
          return { subjectId: sub.id, attended, conducted, percentage, atRisk: percentage !== null && percentage < target };
        });

        const totalConducted  = subjectStats.reduce((a, s) => a + s.conducted, 0);
        const totalAttended   = subjectStats.reduce((a, s) => a + s.attended, 0);
        const overallPct      = totalConducted > 0 ? Math.round((totalAttended / totalConducted) * 1000) / 10 : null;

        return {
          userId: m.userId, name: m.user.name, email: m.user.email,
          role: m.role, batchNumber: m.batchNumber, rollNumber: m.rollNumber ?? null,
          overall: { attended: totalAttended, conducted: totalConducted, percentage: overallPct },
          subjects: subjectStats,
        };
      });

      res.json({ target, subjects, rows });
    } catch (err) { next(err); }
  }
);

// ─── GET /members ─────────────────────────────────────────────
// FIX: rollNumber is now always included in response
router.get(
  "/members",
  requireAuth,
  requireSectionRole(null),
  async (req, res, next) => {
    try {
      const sectionId = req.params.sectionId;
      const full = req.query.full === "true" && isClassAdmin(req.membership.role);

      const memberships = await prisma.sectionMembership.findMany({
        where:   { sectionId },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ rollNumber: { sort: "asc", nulls: "last" } }, { user: { name: "asc" } }],
      });

      const baseMembers = memberships.map((m) => ({
        userId:      m.userId,
        name:        m.user.name,
        email:       m.user.email,
        role:        m.role,
        batchNumber: m.batchNumber,
        rollNumber:  m.rollNumber ?? null,   // ← always included
      }));

      if (!full) return res.json({ members: baseMembers });

      // Full: attach overall attendance %
      const subjects   = await prisma.subject.findMany({ where: { sectionId }, select: { id: true } });
      const subjectIds = subjects.map((s) => s.id);
      const userIds    = memberships.map((m) => m.userId);

      const records = await prisma.attendanceRecord.findMany({
        where:  { userId: { in: userIds }, subjectId: { in: subjectIds } },
        select: { userId: true, status: true },
      });

      const statsByUser = {};
      for (const r of records) {
        if (!statsByUser[r.userId]) statsByUser[r.userId] = { attended: 0, conducted: 0 };
        if (r.status === "attended" || r.status === "missed") {
          statsByUser[r.userId].conducted++;
          if (r.status === "attended") statsByUser[r.userId].attended++;
        }
      }

      res.json({
        members: baseMembers.map((m) => {
          const s = statsByUser[m.userId] || { attended: 0, conducted: 0 };
          return {
            ...m,
            overall: {
              attended:   s.attended,
              conducted:  s.conducted,
              percentage: s.conducted > 0 ? Math.round((s.attended / s.conducted) * 1000) / 10 : null,
            },
          };
        }),
      });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /bulk — CR/SR mark attendance for whole class ──────
router.patch(
  "/bulk",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("date").isISO8601(),
    body("entries").isArray({ min: 1 }),
    body("entries.*.userId").isString().notEmpty(),
    body("entries.*.subjectId").isString().notEmpty(),
    body("entries.*.timetableSlotId").isString().notEmpty(),
    body("entries.*.status").isIn(["attended", "missed"]),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

      const { date, entries } = req.body;
      const sectionId  = req.params.sectionId;
      const targetDate = dateOnly(date);

      const memberIds = new Set(
        (await prisma.sectionMembership.findMany({ where: { sectionId }, select: { userId: true } }))
          .map((m) => m.userId)
      );
      const invalid = entries.filter((e) => !memberIds.has(e.userId));
      if (invalid.length > 0) {
        return res.status(400).json({ error: "Some userIds are not members of this section" });
      }

      await syncAttendanceForSection(sectionId, targetDate, targetDate);

      // Use createMany + updateMany for efficiency instead of per-record loop
      // Step 1: find existing records for these entries
      const existing = await prisma.attendanceRecord.findMany({
        where: {
          userId:     { in: [...new Set(entries.map((e) => e.userId))] },
          subjectId:  { in: [...new Set(entries.map((e) => e.subjectId))] },
          date:       targetDate,
        },
        select: { id: true, userId: true, subjectId: true, timetableSlotId: true, status: true },
      });

      const existingMap = new Map(
        existing.map((r) => [`${r.userId}|${r.subjectId}|${r.timetableSlotId}`, r])
      );

      const toCreate = [];
      let updated = 0;

      for (const entry of entries) {
        const key = `${entry.userId}|${entry.subjectId}|${entry.timetableSlotId}`;
        const rec = existingMap.get(key);

        if (rec) {
          if (rec.status !== "cancelled") {
            await prisma.attendanceRecord.update({
              where: { id: rec.id },
              data:  { status: entry.status, markedByCR: true },
            });
            updated++;
          }
        } else {
          toCreate.push({
            userId:          entry.userId,
            subjectId:       entry.subjectId,
            date:            targetDate,
            timetableSlotId: entry.timetableSlotId,
            status:          entry.status,
            markedByCR:      true,
          });
        }
      }

      let created = 0;
      if (toCreate.length > 0) {
        const result = await prisma.attendanceRecord.createMany({ data: toCreate, skipDuplicates: true });
        created = result.count;
      }

      res.json({ updated, created, total: entries.length });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /by-date/:date — student marks own day ─────────────
router.patch(
  "/by-date/:date",
  requireAuth,
  requireSectionRole(null),
  [param("date").isISO8601(), body("status").isIn(["attended", "missed"]), body("subjectIds").optional().isArray()],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

      const targetDate = dateOnly(req.params.date);
      const { status, subjectIds } = req.body;

      const where = {
        userId:     req.user.id,
        date:       targetDate,
        status:     { not: "cancelled" },
        markedByCR: false,  // students cannot override CR marks
      };
      if (subjectIds?.length) where.subjectId = { in: subjectIds };

      const result = await prisma.attendanceRecord.updateMany({ where, data: { status } });
      res.json({ updated: result.count });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /catchup/:userId — CR marks late joiner's past attendance ──
router.patch(
  "/catchup/:userId",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("from").isISO8601().withMessage("from date required"),
    body("to").isISO8601().withMessage("to date required"),
    body("status").isIn(["attended", "missed"]).withMessage("status must be attended or missed"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

      const { from, to, status } = req.body;
      const { sectionId, userId } = req.params;
      const fromDate = dateOnly(from);
      const toDate   = dateOnly(to);

      // Verify member belongs to section
      const membership = await prisma.sectionMembership.findUnique({
        where: { userId_sectionId: { userId, sectionId } },
      });
      if (!membership) return res.status(404).json({ error: "User is not a member of this section" });

      // Sync the date range first so records exist
      await syncAttendanceForSection(sectionId, fromDate, toDate);

      // Mark all not_yet_occurred records (don't overwrite already-marked ones)
      const result = await prisma.attendanceRecord.updateMany({
        where: {
          userId,
          date:   { gte: fromDate, lte: toDate },
          status: "not_yet_occurred",
        },
        data: { status, markedByCR: true },
      });

      res.json({ updated: result.count, from, to, status });
    } catch (err) { next(err); }
  }
);

// ─── PATCH /:recordId — student marks single record ───────────
router.patch(
  "/:recordId",
  requireAuth,
  requireSectionRole(null),
  [body("status").isIn(["attended", "missed"])],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

      const record = await prisma.attendanceRecord.findUnique({ where: { id: req.params.recordId } });
      if (!record || record.userId !== req.user.id) return res.status(404).json({ error: "Record not found" });
      if (record.status === "cancelled") return res.status(400).json({ error: "Cannot mark a cancelled lecture" });
      if (record.markedByCR) return res.status(403).json({ error: "This record was marked by your CR and cannot be changed" });

      const updated = await prisma.attendanceRecord.update({
        where: { id: record.id },
        data:  { status: req.body.status },
      });
      res.json({ record: updated });
    } catch (err) { next(err); }
  }
);

// ─── GET /stats (named, before /:date wildcard) already above ─

// ─── GET /:date — student's day schedule ─────────────────────
router.get(
  "/:date",
  requireAuth,
  requireSectionRole(null),
  [param("date").isISO8601().withMessage("date must be YYYY-MM-DD")],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: "Validation failed", details: errors.array() });

      const sectionId  = req.params.sectionId;
      const targetDate = dateOnly(req.params.date);

      await syncAttendanceForSection(sectionId, targetDate, targetDate);

      const records = await prisma.attendanceRecord.findMany({
        where:   { userId: req.user.id, date: targetDate },
        include: {
          subject:       { select: { id: true, name: true } },
          timetableSlot: { select: { id: true, dayOfWeek: true, slotIndex: true } },
        },
        orderBy: { timetableSlotId: "asc" },
      });

      res.json({
        date: req.params.date,
        records: records.map((r) => ({
          id:         r.id,
          subject:    r.subject,
          slotIndex:  r.timetableSlot?.slotIndex ?? null,
          dayOfWeek:  r.timetableSlot?.dayOfWeek ?? null,
          status:     r.status,
          markedByCR: r.markedByCR,
        })),
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
