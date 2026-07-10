import { api } from "./client";

export function listAnnouncements(sectionId, { from, to, type } = {}) {
  const p = new URLSearchParams();
  if (from) p.set("from", from);
  if (to)   p.set("to", to);
  if (type) p.set("type", type);
  const qs = p.toString();
  return api.get(`/sections/${sectionId}/announcements${qs ? `?${qs}` : ""}`);
}

export function createAnnouncement(sectionId, { title, body, type, date }) {
  return api.post(`/sections/${sectionId}/announcements`, { title, body, type, date });
}

export function updateAnnouncement(sectionId, announcementId, body) {
  return api.patch(`/sections/${sectionId}/announcements/${announcementId}`, body);
}

export function deleteAnnouncement(sectionId, announcementId) {
  return api.delete(`/sections/${sectionId}/announcements/${announcementId}`);
}
