import { api } from "./client";

export function listExtraLectures(sectionId) {
  return api.get(`/sections/${sectionId}/extra-lectures`);
}

export function createExtraLecture(sectionId, { date, subjectId, reason, attendance }) {
  return api.post(`/sections/${sectionId}/extra-lectures`, { date, subjectId, reason, attendance });
}

export function deleteExtraLecture(sectionId, extraLectureId) {
  return api.delete(`/sections/${sectionId}/extra-lectures/${extraLectureId}`);
}
