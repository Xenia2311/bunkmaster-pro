const express = require("express");
const { body, validationResult } = require("express-validator");

const prisma = require("../utils/prisma");
const { requireAuth, requireSectionRole } = require("../middleware/auth");
const { generateJoinCode } = require("../utils/joinCode");

const router = express.Router();

const VALID_BRANCHES = ["CST", "CS", "IT", "AI", "DS", "ENC"];
const VALID_YEARS    = ["First", "Second", "Third", "Fourth"];

const YEAR_LABELS = {
  First: "1st Year", Second: "2nd Year", Third: "3rd Year", Fourth: "4th Year",
};

/** Build a human-readable display name from branch + year */
function sectionDisplayName(branch, year) {
  return `${branch} ${YEAR_LABELS[year] || year}`;
}

/** Safe section shape for API responses */
function formatSection(s) {
  return {
    id:                s.id,
    branch:            s.branch,
    year:              s.year,
    name:              sectionDisplayName(s.branch, s.year),
    joinCode:          s.joinCode,
    institutionName:   s.institutionName,
    semesterStartDate: s.semesterStartDate,
  };
}

/**
 * POST /sections
 * Create a new section. Creator becomes CR.
 * body: { branch, year, institutionName? }
 */
router.post(
  "/",
  requireAuth,
  [
    body("branch").isIn(VALID_BRANCHES).withMessage(`branch must be one of: ${VALID_BRANCHES.join(", ")}`),
    body("year").isIn(VALID_YEARS).withMessage(`year must be one of: ${VALID_YEARS.join(", ")}`),
    body("institutionName").optional().trim(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { branch, year, institutionName } = req.body;

      // Enforce uniqueness: one section per branch+year
      const duplicate = await prisma.section.findUnique({
        where: { branch_year: { branch, year } },
      });
      if (duplicate) {
        return res.status(409).json({
          error: `A class for ${sectionDisplayName(branch, year)} already exists. Join it using its join code instead.`,
        });
      }

      // Generate unique join code
      let joinCode;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateJoinCode();
        const exists = await prisma.section.findUnique({ where: { joinCode: candidate } });
        if (!exists) { joinCode = candidate; break; }
      }
      if (!joinCode) {
        return res.status(500).json({ error: "Could not generate a unique join code, please retry" });
      }

      const section = await prisma.$transaction(async (tx) => {
        const newSection = await tx.section.create({
          data: { branch, year, institutionName: institutionName || null, joinCode },
        });

        await tx.sectionMembership.create({
          data: { userId: req.user.id, sectionId: newSection.id, role: "cr", batchNumber: 1 },
        });

        // Seed empty 5×9 timetable
        const slots = [];
        for (let day = 0; day < 5; day++) {
          for (let slot = 0; slot < 9; slot++) {
            slots.push({ sectionId: newSection.id, dayOfWeek: day, slotIndex: slot, isBreak: slot === 4 });
          }
        }
        await tx.timetableSlot.createMany({ data: slots });

        return newSection;
      });

      res.status(201).json({ section: formatSection(section), role: "cr" });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /sections/join
 * Join via join code.
 * body: { joinCode, batchNumber? }
 */
router.post(
  "/join",
  requireAuth,
  [
    body("joinCode").trim().notEmpty().withMessage("Join code is required"),
    body("batchNumber").optional().isInt({ min: 1, max: 4 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { joinCode, batchNumber } = req.body;

      const section = await prisma.section.findUnique({
        where: { joinCode: joinCode.toUpperCase() },
      });
      if (!section) {
        return res.status(404).json({ error: "No class found with that join code" });
      }

      const existing = await prisma.sectionMembership.findUnique({
        where: { userId_sectionId: { userId: req.user.id, sectionId: section.id } },
      });
      if (existing) {
        return res.status(409).json({ error: "You are already a member of this class" });
      }

      const membership = await prisma.sectionMembership.create({
        data: {
          userId:      req.user.id,
          sectionId:   section.id,
          role:        "student",
          batchNumber: batchNumber || 1,
        },
      });

      res.status(201).json({
        section:     formatSection(section),
        role:        membership.role,
        batchNumber: membership.batchNumber,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /sections/:sectionId
 * Section details + subjects + members.
 */
router.get("/:sectionId", requireAuth, requireSectionRole(null), async (req, res, next) => {
  try {
    const section = await prisma.section.findUnique({
      where: { id: req.params.sectionId },
      include: {
        subjects:    { orderBy: { createdAt: "asc" } },
        memberships: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
    if (!section) return res.status(404).json({ error: "Section not found" });

    res.json({
      section: formatSection(section),
      subjects: section.subjects,
      members: section.memberships.map((m) => ({
        userId:      m.userId,
        name:        m.user.name,
        email:       m.user.email,
        role:        m.role,
        batchNumber: m.batchNumber,
      })),
      yourRole:        req.membership.role,
      yourBatchNumber: req.membership.batchNumber,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /sections/:sectionId
 * CR/SR only: update institutionName or semesterStartDate.
 * Cannot change branch or year (that would break the uniqueness model).
 */
router.patch(
  "/:sectionId",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("semesterStartDate").optional().isISO8601(),
    body("institutionName").optional().trim(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { semesterStartDate, institutionName } = req.body;

      const updated = await prisma.section.update({
        where: { id: req.params.sectionId },
        data: {
          ...(semesterStartDate !== undefined ? { semesterStartDate: new Date(semesterStartDate) } : {}),
          ...(institutionName   !== undefined ? { institutionName }                                : {}),
        },
      });

      res.json({ section: formatSection(updated) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /sections/:sectionId/members/:userId
 * CR/SR only: update a member's role or batch.
 */
router.patch(
  "/:sectionId/members/:userId",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("role").optional().isIn(["student", "cr", "sr"]),
    body("batchNumber").optional().isInt({ min: 1, max: 4 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { role, batchNumber } = req.body;
      const { sectionId, userId } = req.params;

      const membership = await prisma.sectionMembership.findUnique({
        where: { userId_sectionId: { userId, sectionId } },
      });
      if (!membership) return res.status(404).json({ error: "Member not found in this class" });

      const updated = await prisma.sectionMembership.update({
        where: { userId_sectionId: { userId, sectionId } },
        data: {
          ...(role        !== undefined ? { role }        : {}),
          ...(batchNumber !== undefined ? { batchNumber } : {}),
        },
      });

      res.json({ userId: updated.userId, role: updated.role, batchNumber: updated.batchNumber });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
