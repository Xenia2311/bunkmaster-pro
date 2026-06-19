import { api } from "./client";

export function getTimetable(sectionId) {
  return api.get(`/sections/${sectionId}/timetable`);
}

/**
 * @param {string} sectionId
 * @param {number} dayOfWeek 0-4 (Mon-Fri)
 * @param {number} slotIndex 0-8
 * @param {{ subjectId?: string|null, labAssignments?: { batchNumber: number, subjectId: string|null }[] }} body
 */
export function updateTimetableSlot(sectionId, dayOfWeek, slotIndex, body) {
  return api.put(`/sections/${sectionId}/timetable/${dayOfWeek}/${slotIndex}`, body);
}
