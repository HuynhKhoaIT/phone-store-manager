import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { getSessionUser, type SessionUser } from "./auth";

export const BRANCH_COOKIE = "branchId";

/** Tất cả chi nhánh (kể cả đã ẩn) — dùng cho lịch sử, báo cáo. */
export async function getBranches() {
  return prisma.branch.findMany({ orderBy: { id: "asc" } });
}

export async function getActiveBranches() {
  return prisma.branch.findMany({ where: { active: true }, orderBy: { id: "asc" } });
}

/** Chi nhánh đang hoạt động mà người dùng được phép làm việc. Admin hoặc nhân viên chưa phân công = tất cả. */
export async function getAllowedBranches(user: SessionUser) {
  if (user.role === "ADMIN") return getActiveBranches();
  const assigned = await prisma.branch.findMany({
    where: { active: true, staff: { some: { id: user.id } } },
    orderBy: { id: "asc" },
  });
  if (assigned.length > 0) return assigned;
  const hasAnyAssignment = await prisma.branch.count({ where: { staff: { some: { id: user.id } } } });
  // Được phân công nhưng các chi nhánh đó đều đã ẩn → không còn chi nhánh nào
  return hasAnyAssignment ? [] : getActiveBranches();
}

/**
 * Chi nhánh làm việc của phiên hiện tại (chọn lúc đăng nhập, lưu trong cookie).
 * Trả về null nếu chưa chọn hoặc chi nhánh đã chọn không còn hợp lệ.
 */
export const getCurrentBranch = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  const allowed = await getAllowedBranches(user);
  const id = Number((await cookies()).get(BRANCH_COOKIE)?.value);
  return allowed.find((b) => b.id === id) ?? (allowed.length === 1 ? allowed[0] : null);
});
