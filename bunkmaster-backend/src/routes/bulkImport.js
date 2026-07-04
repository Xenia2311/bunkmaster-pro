const express = require("express");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const prisma = require("../utils/prisma");
const { requireAuth, requireSectionRole } = require("../middleware/auth");

const router = express.Router({ mergeParams: true });
const SALT_ROUNDS = 10;

/**
 * POST /sections/:sectionId/bulk-import
 * CR/SR only: pre-register classmates and add them to the section.
 * body: { members: [{ name, email, phone }], batchNumber?: 1-4 }
 */
router.post(
  "/",
  requireAuth,
  requireSectionRole(["cr", "sr"]),
  [
    body("members").isArray({ min: 1 }),
    body("members.*.name").trim().notEmpty(),
    body("members.*.email").isEmail().normalizeEmail(),
    body("members.*.phone").isString().trim().isLength({ min: 8, max: 15 }),
    body("batchNumber").optional().isInt({ min: 1, max: 4 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Validation failed", details: errors.array() });
      }

      const { members, batchNumber = 1 } = req.body;
      const sectionId = req.params.sectionId;

      const results = { created: [], addedToSection: [], alreadyMember: [], failed: [] };

      for (const entry of members) {
        const email = entry.email.toLowerCase().trim();
        const name  = entry.name.trim();
        const phone = entry.phone.trim().replace(/\s+/g, "");

        try {
          let user = await prisma.user.findUnique({ where: { email } });
          let isNew = false;

          if (!user) {
            const passwordHash = await bcrypt.hash(phone, SALT_ROUNDS);
            user  = await prisma.user.create({ data: { email, name, passwordHash } });
            isNew = true;
          }

          const existing = await prisma.sectionMembership.findUnique({
            where: { userId_sectionId: { userId: user.id, sectionId } },
          });

          if (existing) {
            results.alreadyMember.push({ name, email });
            continue;
          }

          await prisma.sectionMembership.create({
            data: { userId: user.id, sectionId, role: "student", batchNumber: Number(batchNumber) },
          });

          isNew ? results.created.push({ name, email })
                : results.addedToSection.push({ name, email });

        } catch (e) {
          results.failed.push({ name, email, reason: e.message });
        }
      }

      res.status(201).json({
        summary: {
          total:          members.length,
          created:        results.created.length,
          addedToSection: results.addedToSection.length,
          alreadyMember:  results.alreadyMember.length,
          failed:         results.failed.length,
        },
        details: results,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
