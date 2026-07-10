import { api } from "./client";

export function syncAttendance(sectionId, { from, to } = {}) {
  const body = {};
  if (from) body.from = from;
  if (to)   body.to   = to;
  return api.post(`/sections/${sectionId}/attendance/sync`, body);
}

export function getStats(sectionId, target) {
  const qs = target ? `?target=${encodeURIComponent(target)}` : "";
  return api.get(`/sections/${sectionId}/attendance/stats${qs}`);
}

export function getReport(sectionId, target) {
  const qs = target ? `?target=${encodeURIComponent(target)}` : "";
  return api.get(`/sections/${sectionId}/attendance/report${qs}`);
}

export function getMembers(sectionId, { full = false } = {}) {
  return api.get(`/sections/${sectionId}/attendance/members${full ? "?full=true" : ""}`);
}

export function getDayAttendance(sectionId, date) {
  return api.get(`/sections/${sectionId}/attendance/${date}`);
}

export function markAttendance(sectionId, recordId, status) {
  return api.patch(`/sections/${sectionId}/attendance/${recordId}`, { status });
}

export function markDayAttendance(sectionId, date, { status, subjectIds }) {
  return api.patch(`/sections/${sectionId}/attendance/by-date/${date}`, { status, subjectIds });
}

export function bulkMarkAttendance(sectionId, { date, entries }) {
  return api.patch(`/sections/${sectionId}/attendance/bulk`, { date, entries });
}

export function catchupAttendance(sectionId, userId, { from, to, status }) {
  return api.patch(`/sections/${sectionId}/attendance/catchup/${userId}`, { from, to, status });
}
