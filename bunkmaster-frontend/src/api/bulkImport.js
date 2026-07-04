import { api } from "./client";

export function bulkImportMembers(sectionId, { members, batchNumber }) {
  return api.post(`/sections/${sectionId}/bulk-import`, { members, batchNumber });
}

export function changePassword({ currentPassword, newPassword }) {
  return api.post("/auth/change-password", { currentPassword, newPassword });
}
