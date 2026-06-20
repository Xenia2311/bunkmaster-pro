const express = require("express");
const { body, query, validationResult } = require("express-validator");
const prisma = require("../utils/prisma");
const { requireAuth, requireSectionRole } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });

const VALID_TYPES = ["test", "quiz", "assignment", "notice", "holiday"];

/**
 * GET /sections/:sectionId/announcements?from=&to=&type=
 * Any member can view. Optional filters.
 */
router.get(
  "/",
  requireAuth,
  requireSectionRole(null),
  [
    query("from").optional().isISO8601(),
    query("to").optional().isISO8601(),
    query("type").optional().isIn(VALID_TYPES),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { from, to, type } = req.query;
      const where = { sectionId: req.params.sectionId };

      if (from || to) {
        where.date = {};
        if (from) where.date.gte = new Date(from);
        if (to)   where.date.lte = new Date(to);
      }
      if (type) where.type = type;

      const announcements = await prisma.announcement.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
      });

      res.json({ announcements });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /sections/:sectionId/announcements
 * CR/SR only.
 * body: { title, body?, type?, date }
 */
router.post(
  "/",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("title").trim().notEmpty().withMessage("title is required"),
    body("body").optional().trim(),
    body("type").optional().isIn(VALID_TYPES),
    body("date").isISO8601().withMessage("date must be YYYY-MM-DD"),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { title, body: bodyText, type, date } = req.body;

      const announcement = await prisma.announcement.create({
        data: {
          sectionId:   req.params.sectionId,
          title,
          body:        bodyText || null,
          type:        type || "notice",
          date:        new Date(date),
          createdById: req.user.id,
        },
        include: { createdBy: { select: { id: true, name: true } } },
      });

      res.status(201).json({ announcement });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /sections/:sectionId/announcements/:announcementId
 * CR/SR only — edit an announcement.
 */
router.patch(
  "/:announcementId",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("title").optional().trim().notEmpty(),
    body("body").optional().trim(),
    body("type").optional().isIn(VALID_TYPES),
    body("date").optional().isISO8601(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const existing = await prisma.announcement.findFirst({
        where: { id: req.params.announcementId, sectionId: req.params.sectionId },
      });
      if (!existing) return res.status(404).json({ error: "Announcement not found" });

      const { title, body: bodyText, type, date } = req.body;
      const updated = await prisma.announcement.update({
        where: { id: existing.id },
        data: {
          ...(title     !== undefined ? { title }              : {}),
          ...(bodyText  !== undefined ? { body: bodyText }     : {}),
          ...(type      !== undefined ? { type }               : {}),
          ...(date      !== undefined ? { date: new Date(date) } : {}),
        },
        include: { createdBy: { select: { id: true, name: true } } },
      });

      res.json({ announcement: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /sections/:sectionId/announcements/:announcementId
 * CR/SR only.
 */
router.delete(
  "/:announcementId",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  async (req, res, next) => {
    try {
      const existing = await prisma.announcement.findFirst({
        where: { id: req.params.announcementId, sectionId: req.params.sectionId },
      });
      if (!existing) return res.status(404).json({ error: "Announcement not found" });

      await prisma.announcement.delete({ where: { id: existing.id } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
