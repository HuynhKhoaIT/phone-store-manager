import { getPublicProducts, preflight, publicHeaders } from "@/lib/public-api";

/** GET /api/public/products/:slug — chi tiết 1 sản phẩm (kể cả đã bán, để link cũ không lỗi) + sản phẩm liên quan. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = publicHeaders(req.headers.get("origin"));
  const all = await getPublicProducts();
  const product = all.find((p) => p.slug === slug);
  if (!product) return Response.json({ error: "Không tìm thấy sản phẩm" }, { status: 404, headers });

  // Cùng loại, còn hàng, giá gần nhất
  const related = all
    .filter((p) => p.id !== product.id && p.status === "AVAILABLE" && p.category === product.category)
    .sort((a, b) => Math.abs(a.finalPrice - product.finalPrice) - Math.abs(b.finalPrice - product.finalPrice))
    .slice(0, 8);
  return Response.json({ product, related }, { headers });
}

export const OPTIONS = preflight;
