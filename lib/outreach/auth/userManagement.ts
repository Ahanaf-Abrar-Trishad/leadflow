export interface UserRoleInfo {
  id: string;
  role: string;
}

/** True only when removing/demoting `targetId` would leave zero admins. */
export function isLastAdmin(users: UserRoleInfo[], targetId: string): boolean {
  const target = users.find((u) => u.id === targetId);
  if (!target || target.role !== "admin") return false;
  const adminCount = users.filter((u) => u.role === "admin").length;
  return adminCount <= 1;
}
