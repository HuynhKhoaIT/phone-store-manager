import { getWebBranches } from "@/lib/branch";
import { preflight, publicHeaders } from "@/lib/public-api";

type WebBranch = Awaited<ReturnType<typeof getWebBranches>>[number];

/** Toạ độ trong link Google Maps: ".../@15.1,108.8,17z", "?q=15.1,108.8", "!3d15.1!4d108.8" — link rút gọn thì không có */
function mapCoords(url: string | null) {
  if (!url) return null;
  const m =
    url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ??
    url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ??
    url.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  return m ? `${m[1]},${m[2]}` : null;
}

/** Link nhắn Zalo: admin dán link thì dùng nguyên; số điện thoại thì zalo.me/0xxx (đổi +84 / 84 về 0) */
function zaloUrl(zalo: string | null, phone: string | null) {
  if (zalo && /^https?:\/\//i.test(zalo)) return zalo;
  const digits = (zalo || phone || "").replace(/\D/g, "").replace(/^84(?=\d{9}$)/, "0");
  return digits ? `https://zalo.me/${digits}` : null;
}

function toPublicBranch(b: WebBranch) {
  const coords = mapCoords(b.mapUrl);
  // Tên chi nhánh nội bộ (vd "Mobile - Quận 8") có thể làm Google tìm sai → chỉ dùng địa chỉ
  const query = coords ?? b.address;
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    phone: b.phone,
    zaloUrl: zaloUrl(b.zalo, b.phone),
    facebookUrl: b.facebookUrl,
    tiktokUrl: b.tiktokUrl,
    openingHours: b.openingHours,
    // Nút "Chỉ đường": link admin dán, không có thì tìm theo địa chỉ
    mapUrl:
      b.mapUrl ??
      (query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null),
    // Bản đồ nhúng (iframe): theo toạ độ nếu có, không thì theo địa chỉ
    mapEmbedUrl: query ? `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed` : null,
  };
}

/**
 * GET /api/public/branches — cửa hàng hiện trên web (đang hoạt động + bật "Hiện trên web"),
 * sắp theo thứ tự admin đặt. Cửa hàng đầu tiên = hotline / Zalo chính của web.
 */
export async function GET(req: Request) {
  const items = (await getWebBranches()).map(toPublicBranch);
  return Response.json({ items }, { headers: publicHeaders(req.headers.get("origin")) });
}

export const OPTIONS = preflight;
