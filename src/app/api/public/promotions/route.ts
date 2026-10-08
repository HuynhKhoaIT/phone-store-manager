import { getPublicPromotions, preflight, publicHeaders } from "@/lib/public-api";

/**
 * GET /api/public/promotions — chương trình khuyến mãi đang diễn ra (nổi bật → thứ tự → mới nhất).
 * ?includeUpcoming=1 gồm cả chương trình sắp diễn ra.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const items = await getPublicPromotions(sp.get("includeUpcoming") === "1");
  return Response.json({ items }, { headers: publicHeaders(req.headers.get("origin")) });
}

export const OPTIONS = preflight;
