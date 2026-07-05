import { api } from "./client";

export function createSection({ branch, year, institutionName }) {
  return api.post("/sections", { branch, year, institutionName });
}

export function joinSection({ joinCode, batchNumber }) {
  return api.post("/sections/join", { joinCode, batchNumber });
}

export function getSection(sectionId) {
  return api.get(`/sections/${sectionId}`);
}

export function updateSection(sectionId, body) {
  return api.patch(`/sections/${sectionId}`, body);
}

export function updateMember(sectionId, userId, body) {
  return api.patch(`/sections/${sectionId}/members/${userId}`, body);
}

/** Student updates their own batch number */
export function updateMyBatch(sectionId, userId, batchNumber) {
  return api.patch(`/sections/${sectionId}/members/${userId}`, { batchNumber });
}
