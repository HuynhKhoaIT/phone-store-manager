import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CACHE_SECONDS, TAGS } from "./cache";
import { todayVN } from "./format";
import { appliesToBranch, promotionStatus } from "./promotion-labels";

/**
 * Mọi chương trình chưa tạm dừng (cache tag "promotions"). Lọc theo ngày lúc dùng — không lọc trong cache —
 * để chương trình tự bắt đầu / kết thúc đúng ngày mà không cần sửa dữ liệu.
 */
export const getPromotionRows = unstable_cache(
  async () =>
    prisma.promotion.findMany({
      where: { active: true },
      // Không lấy cột Date (cache trả JSON)
      select: {
        id: true,
        title: true,
        slug: true,
        type: true,
        discountType: true,
        discountValue: true,
        maxDiscount: true,
        summary: true,
        content: true,
        bannerUrl: true,
        startDate: true,
        endDate: true,
        categories: true,
        brandIds: true,
        conditions: true,
        productIds: true,
        branchIds: true,
        active: true,
        showOnWeb: true,
        featured: true,
        sortOrder: true,
      },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { startDate: "desc" }, { id: "desc" }],
    }),
  ["promotions"],
  { tags: [TAGS.promotions], revalidate: CACHE_SECONDS },
);

export type PromotionRow = Awaited<ReturnType<typeof getPromotionRows>>[number];

/** Chương trình đang diễn ra hôm nay; truyền `branchId` để chỉ lấy chương trình áp dụng ở chi nhánh đó. */
export async function getRunningPromotions(branchId?: number) {
  const today = todayVN();
  return (await getPromotionRows()).filter(
    (p) => promotionStatus(p, today) === "RUNNING" && (branchId == null || appliesToBranch(p, branchId)),
  );
}
