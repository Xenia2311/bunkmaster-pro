import { api } from "./client";

export function listExtraLectures(sectionId) {
  return api.get(`/sections/${sectionId}/extra-lectures`);
}

export function createExtraLecture(sectionId, { date, subjectId, reason, attendance }) {
  return api.post(`/sections/${sectionId}/extra-lectures`, { date, subjectId, reason, attendance });
}

export function updateExtraLectureAttendance(sectionId, extraLectureId, { recordId, status }) {
  return api.patch(`/sections/${sectionId}/extra-lectures/${extraLectureId}/attendance`, { recordId, status });
}

export function deleteExtraLecture(sectionId, extraLectureId) {
  return api.delete(`/sections/${sectionId}/extra-lectures/${extraLectureId}`);
}
