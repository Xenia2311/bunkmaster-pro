import { api } from "./client";

export function listHolidays(sectionId, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return api.get(`/sections/${sectionId}/holidays${qs ? `?${qs}` : ""}`);
}

export function addHoliday(sectionId, { date, name, type }) {
  return api.post(`/sections/${sectionId}/holidays`, { date, name, type });
}

export function bulkAddHolidays(sectionId, holidays) {
  return api.post(`/sections/${sectionId}/holidays/bulk`, { holidays });
}

export function deleteHoliday(sectionId, holidayId) {
  return api.delete(`/sections/${sectionId}/holidays/${holidayId}`);
}
