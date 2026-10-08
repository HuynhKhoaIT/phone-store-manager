import { cache } from "react";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { CACHE_SECONDS, TAGS } from "./cache";
import { prisma } from "./db";
import { getSessionUser, type SessionUser } from "./auth";

export const BRANCH_COOKIE = "branchId";

const BRANCH_FIELDS = { id: true, name: true, active: true } as const;

/** Tất cả chi nhánh (kể cả đã ẩn) — dùng cho lịch sử, báo cáo. */
export const getBranches = unstable_cache(
  () => prisma.branch.findMany({ select: BRANCH_FIELDS, orderBy: { id: "asc" } }),
  ["branches-all"],
  { tags: [TAGS.branches], revalidate: CACHE_SECONDS },
);

export const getActiveBranches = unstable_cache(
  () => prisma.branch.findMany({ where: { active: true }, select: BRANCH_FIELDS, orderBy: { id: "asc" } }),
  ["branches-active"],
  { tags: [TAGS.branches], revalidate: CACHE_SECONDS },
);

/** Id các chi nhánh nhân viên được phân công (rỗng = mọi chi nhánh). */
const getAssignedBranchIds = unstable_cache(
  async (userId: number) =>
    (await prisma.branch.findMany({ where: { staff: { some: { id: userId } } }, select: { id: true } })).map(
      (b) => b.id,
    ),
  ["user-branch-ids"],
  { tags: [TAGS.users, TAGS.branches], revalidate: CACHE_SECONDS },
);

/**
 * Chi nhánh đang hoạt động mà người dùng được phép làm việc. Admin hoặc nhân viên chưa phân công = tất cả.
 * Được cache theo request (layout và getCurrentBranch dùng chung) và chạy song song để giảm số lần gọi DB.
 */
export const getAllowedBranches = cache(async (user: Pick<SessionUser, "id" | "role">) => {
  if (user.role === "ADMIN") return getActiveBranches();
  const [active, assigned] = await Promise.all([getActiveBranches(), getAssignedBranchIds(user.id)]);
  if (assigned.length === 0) return active;
  // Được phân công nhưng các chi nhánh đó đều đã ẩn → danh sách rỗng
  const ids = new Set(assigned);
  return active.filter((b) => ids.has(b.id));
});

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

/** Cửa hàng hiện trên web bán hàng (/api/public/branches): đang hoạt động + bật "Hiện trên web". */
export const getWebBranches = unstable_cache(
  () =>
    prisma.branch.findMany({
      where: { active: true, showOnWeb: true },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        zalo: true,
        facebookUrl: true,
        tiktokUrl: true,
        mapUrl: true,
        openingHours: true,
      },
      orderBy: [{ webSortOrder: "asc" }, { id: "asc" }],
    }),
  ["branches-web"],
  { tags: [TAGS.branches], revalidate: CACHE_SECONDS },
);
