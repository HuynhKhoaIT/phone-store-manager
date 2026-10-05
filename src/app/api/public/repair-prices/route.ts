import { getPublicRepairPrices, preflight, publicHeaders } from "@/lib/public-api";

/** GET /api/public/repair-prices — bảng giá sửa chữa (không có ghi chú nội bộ), sắp theo dịch vụ rồi dòng máy. */
export async function GET(req: Request) {
  return Response.json({ items: await getPublicRepairPrices() }, { headers: publicHeaders(req.headers.get("origin")) });
}

export const OPTIONS = preflight;
