import { api } from "./client";

export function listCancellations(sectionId, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to)   params.set("to", to);
  const qs = params.toString();
  return api.get(`/sections/${sectionId}/cancellations${qs ? `?${qs}` : ""}`);
}

export function createCancellation(sectionId, { date, timetableSlotId, subjectId, reason }) {
  return api.post(`/sections/${sectionId}/cancellations`, { date, timetableSlotId, subjectId, reason });
}

export function getRescheduleOptions(sectionId, cancellationId, windowDays) {
  const qs = windowDays ? `?days=${encodeURIComponent(windowDays)}` : "";
  return api.get(`/sections/${sectionId}/cancellations/${cancellationId}/reschedule-options${qs}`);
}

export function rescheduleCancellation(sectionId, cancellationId, { date, timetableSlotId }) {
  return api.post(`/sections/${sectionId}/cancellations/${cancellationId}/reschedule`, {
    date,
    timetableSlotId,
  });
}
