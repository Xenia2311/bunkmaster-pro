const prisma = require("./prisma");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toTimetableDayOfWeek(jsDay) {
  if (jsDay === 0 || jsDay === 6) return null;
  return jsDay - 1;
}

function dateOnly(d) {
  if (typeof d === "string") {
    const s = d.slice(0, 10);
    const [y, m, day] = s.split("-").map(Number);
    const result = new Date(Date.UTC(y, m - 1, day));
    return result;
  }
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function toDateKey(d) {
  return dateOnly(d).toISOString().slice(0, 10);
}

/**
 * Sync attendance records for a section across a date range [from, to] inclusive.
 *
 * Key behaviours:
 * - Skips weekends and holidays entirely (no records created)
 * - Lecture slots → records for ALL section members
 * - Lab slots → records for ONLY that batch's members
 * - Lab pair (isLabPair=true on first slot): only ONE record per student per pair.
 *   The continuation slot (slotIndex+1) is skipped.
 * - Cancelled slot+subject → record status = "cancelled"
 * - All records are created with skipDuplicates (idempotent)
 * - After creation, any existing non-CR records for cancelled slots are flipped to "cancelled"
 */
async function syncAttendanceForSection(sectionId, from, to) {
  const fromDate = dateOnly(from);
  const toDate   = dateOnly(to);

  if (fromDate > toDate) return { created: 0, scannedDays: 0 };

  const [timetableSlots, holidays, memberships, cancellations] = await Promise.all([
    prisma.timetableSlot.findMany({
      where:   { sectionId, isBreak: false },
      include: { labSlots: true },
    }),
    prisma.holidayCalendar.findMany({
      where: { sectionId, date: { gte: fromDate, lte: toDate } },
    }),
    prisma.sectionMembership.findMany({
      where:  { sectionId },
      select: { userId: true, batchNumber: true },
    }),
    prisma.cancellation.findMany({
      where: { sectionId, date: { gte: fromDate, lte: toDate }, status: "cancelled" },
    }),
  ]);

  const holidayDateKeys = new Set(holidays.map((h) => toDateKey(h.date)));

  const membersByBatch = new Map();

  for (const member of memberships) {
  if (!membersByBatch.has(member.batchNumber)) {
  membersByBatch.set(member.batchNumber, []);
  }
  membersByBatch.get(member.batchNumber).push(member);
  }

  const slotsByDay = new Map();
  for (const slot of timetableSlots) {
    if (!slotsByDay.has(slot.dayOfWeek)) slotsByDay.set(slot.dayOfWeek, []);
    slotsByDay.get(slot.dayOfWeek).push(slot);
  }

  // "dateKey|slotId|subjectId" → cancellation row
  const cancellationMap = new Map();
  for (const c of cancellations) {
    const key = `${toDateKey(c.date)}|${c.timetableSlotId}|${c.subjectId}`;
    cancellationMap.set(key, c);
  }

  const recordsToCreate = [];
  let scannedDays = 0;

  for (
    let d = new Date(fromDate);
    d <= toDate;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const current    = new Date(d);
    const dateKey    = toDateKey(current);
    const timetableDay = toTimetableDayOfWeek(current.getUTCDay());

    if (timetableDay === null) continue; // weekend
    if (holidayDateKeys.has(dateKey)) continue; // holiday

    scannedDays++;

    const daySlots = (slotsByDay.get(timetableDay) || [])
      .sort((a, b) => a.slotIndex - b.slotIndex);

    // Track which slots are lab pair continuations: "slotIndex-batchNumber"
    const continuationKeys = new Set();

    for (const slot of daySlots) {
      // ── Lecture (all members) ──
      if (slot.subjectId) {
        const isCancelled = cancellationMap.has(`${dateKey}|${slot.id}|${slot.subjectId}`);
        const status = isCancelled ? "cancelled" : "not_yet_occurred";
        for (const member of memberships) {
          recordsToCreate.push({
            userId:          member.userId,
            subjectId:       slot.subjectId,
            date:            current.toISOString(),
            status,
            timetableSlotId: slot.id,
          });
        }
      }

      // ── Labs (per batch) ──
      for (const lab of slot.labSlots) {
        if (!lab.subjectId) continue;

        const contKey = `${slot.slotIndex}-${lab.batchNumber}`;
        if (continuationKeys.has(contKey)) continue; // skip continuation slot

        // If this is a 2h lab pair start, mark next slot as continuation
        if (lab.isLabPair) {
          continuationKeys.add(`${slot.slotIndex + 1}-${lab.batchNumber}`);
        }

        const isCancelled = cancellationMap.has(`${dateKey}|${slot.id}|${lab.subjectId}`);
        const status = isCancelled ? "cancelled" : "not_yet_occurred";

        const batchMembers = membersByBatch.get(lab.batchNumber) || [];
        for (const member of batchMembers) {
          recordsToCreate.push({
            userId:          member.userId,
            subjectId:       lab.subjectId,
            date:            current.toISOString(),
            status,
            timetableSlotId: slot.id,
          });
        }
      }
    }
  }

  if (recordsToCreate.length === 0) {
    return { created: 0, scannedDays };
  }

  // Deduplicate in-memory
  const seen    = new Set();
  const deduped = [];
  for (const rec of recordsToCreate) {
    const key = `${rec.userId}|${rec.subjectId}|${rec.date}|${rec.timetableSlotId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(rec);
  }

  const result = await prisma.attendanceRecord.createMany({
    data:           deduped,
    skipDuplicates: true,
  });

  // Flip any existing non-CR records for cancelled slots to "cancelled"
await prisma.$transaction(
  cancellations.map((c) =>
    prisma.attendanceRecord.updateMany({
      where: {
        date: c.date,
        timetableSlotId: c.timetableSlotId,
        subjectId: c.subjectId,
        markedByCR: false,
      },
      data: {
        status: "cancelled",
      },
    })
  )
);

  return { created: result.count, scannedDays };
}

async function syncAttendanceToToday(sectionId, fallbackFrom) {
  const section = await prisma.section.findUnique({
    where:  { id: sectionId },
    select: { semesterStartDate: true },
  });

  const from = section?.semesterStartDate || fallbackFrom;
  if (!from) return { created: 0, scannedDays: 0, skipped: "no_start_date" };

  return syncAttendanceForSection(sectionId, from, new Date());
}

module.exports = {
  syncAttendanceForSection,
  syncAttendanceToToday,
  toTimetableDayOfWeek,
  dateOnly,
  toDateKey,
  DAY_NAMES,
};
