import { buildFilters, getPublicProducts, preflight, publicHeaders } from "@/lib/public-api";

/** GET /api/public/filters — loại hàng, thương hiệu, tình trạng (kèm số lượng) và khoảng giá cho bộ lọc trên web. */
export async function GET(req: Request) {
  return Response.json(buildFilters(await getPublicProducts()), { headers: publicHeaders(req.headers.get("origin")) });
}

export const OPTIONS = preflight;
