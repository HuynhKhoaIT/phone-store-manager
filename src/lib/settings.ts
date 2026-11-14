import { unstable_cache } from "next/cache";
import { CACHE_SECONDS, TAGS } from "./cache";
import { prisma } from "./db";

const DEFAULT_LOW_STOCK_THRESHOLD = 2;

/** Thiết lập chung của cửa hàng (luôn 1 dòng id = 1). Chưa từng lưu thì dùng giá trị mặc định. */
export const getAppSettings = unstable_cache(
  async () => {
    const row = await prisma.appSetting.findUnique({ where: { id: 1 } });
    return { lowStockThreshold: row?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD };
  },
  ["app-settings"],
  { tags: [TAGS.settings], revalidate: CACHE_SECONDS },
);
