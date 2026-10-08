import { getPublicPromotion, preflight, publicHeaders } from "@/lib/public-api";

/** GET /api/public/promotions/:slug — chi tiết chương trình (kể cả đã kết thúc) + sản phẩm còn hàng được áp dụng. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = publicHeaders(req.headers.get("origin"));
  const result = await getPublicPromotion(slug);
  if (!result) return Response.json({ error: "Không tìm thấy chương trình khuyến mãi" }, { status: 404, headers });
  return Response.json(result, { headers });
}

export const OPTIONS = preflight;
