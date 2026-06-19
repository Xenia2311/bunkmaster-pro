import { api } from "./client";

export function listSubjects(sectionId) {
  return api.get(`/sections/${sectionId}/subjects`);
}

export function createSubject(sectionId, { name, semesterTotal }) {
  return api.post(`/sections/${sectionId}/subjects`, { name, semesterTotal });
}

export function updateSubject(sectionId, subjectId, body) {
  return api.patch(`/sections/${sectionId}/subjects/${subjectId}`, body);
}

export function deleteSubject(sectionId, subjectId) {
  return api.delete(`/sections/${sectionId}/subjects/${subjectId}`);
}
