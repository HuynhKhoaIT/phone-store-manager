import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CACHE_SECONDS, TAGS } from "./cache";
import { parseWarrantyMonths } from "./format";
import { isSingleUnit, productPickLabel, sellingPrice } from "./product-labels";
import { discountText, promotionsFor } from "./promotion-labels";
import { getRunningPromotions } from "./promotions";
import type { PriceSuggestion } from "@/components/TransactionFields";

export { CATEGORY_LABEL, CONDITION_LABEL, STATUS_LABEL, productLabel, productStatus } from "./product-labels";

/** Gợi ý tên + giá khi nhập giao dịch, lấy từ bảng giá (cache, xoá khi sửa bảng giá / bán máy). */
export const getPriceSuggestions = unstable_cache(loadPriceSuggestions, ["price-suggestions"], {
  tags: [TAGS.prices], revalidate: CACHE_SECONDS,
});

async function loadPriceSuggestions() {
  const [products, repairs] = await Promise.all([
    // Chỉ máy đang bán (chưa bán, chưa ẩn)
    prisma.product.findMany({
      where: { active: true, soldBranchId: null },
      include: { ownerBranch: { select: { name: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.repairPrice.findMany({ orderBy: [{ device: "asc" }, { service: "asc" }, { price: "asc" }, { id: "asc" }] }),
  ]);
  type Match = { id: number; category: string; brandId: number | null; condition: string };
  const sale: (PriceSuggestion & { match: Match })[] = products.map((p) => ({
    // Khi lưu, server lấy lại tên đầy đủ từ productId (productLabel) nên nhãn này chỉ để hiển thị / tìm kiếm
    label: productPickLabel(p),
    // Điện thoại có giá sale thì gợi ý giá sale
    price: sellingPrice(p),
    warrantyMonths: p.warrantyMonths,
    productId: p.id,
    // Trang Bán hàng dùng để ghi "(hàng quán khác)" và lọc danh sách quà tặng
    ownerBranchId: p.ownerBranchId,
    ownerName: p.ownerBranch?.name,
    quantity: isSingleUnit(p) ? undefined : p.quantity,
    giftable: !isSingleUnit(p) && p.category === "ACCESSORY",
    // Để áp khuyến mãi (getSaleSuggestions) — bỏ đi trước khi gửi xuống client
    match: { id: p.id, category: p.category, brandId: p.brandId, condition: p.condition },
  }));
  // Một gợi ý cho mỗi dịch vụ × dòng máy; nhiều loại linh kiện thì kèm `variants` để chọn loại khi bán
  const groups = new Map<string, typeof repairs>();
  for (const r of repairs) {
    const key = `${r.service} ${r.device}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const repair: PriceSuggestion[] = [...groups].map(([label, rows]) => {
    // Không gửi giá nhập xuống client — server lấy lại theo `id` khi lưu giao dịch
    const variants = rows.map((r) => ({
      id: r.id,
      name: r.variant ?? "",
      price: r.price,
      warranty: r.warranty ?? undefined,
      warrantyMonths: parseWarrantyMonths(r.warranty),
    }));
    // Giá thấp nhất (> 0) làm giá gợi ý; chọn loại sẽ điền đúng giá loại đó
    const priced = variants.filter((v) => v.price > 0);
    const base = priced[0] ?? variants[0];
    return {
      label,
      price: base.price,
      warrantyMonths: base.warrantyMonths,
      variants,
    };
  });
  return { sale, repair };
}

/** Dịch vụ sửa chữa hay gặp — gợi ý khi nhập bảng giá */
export const COMMON_REPAIR_SERVICES = ["Thay pin", "Thay màn hình", "Ép kính", "Thay mặt lưng", "Thay chân sạc", "Thay camera", "Thay loa"];

/** Tên dịch vụ đã có trong bảng giá + dịch vụ hay gặp */
export async function getRepairServiceNames() {
  const rows = await prisma.repairPrice.findMany({ select: { service: true }, distinct: ["service"], orderBy: { service: "asc" } });
  return [...new Set([...rows.map((r) => r.service), ...COMMON_REPAIR_SERVICES])];
}

/**
 * Tách tên đơn sửa chữa gõ tay thành dịch vụ / dòng máy / loại theo tên dịch vụ đã biết,
 * vd "Thay màn hình iPhone 8 Plus (OLED)" → { service: "Thay màn hình", device: "iPhone 8 Plus", variant: "OLED" }.
 */
export function splitRepairName(name: string, services: string[]) {
  const text = name.trim();
  const service = services
    .filter((s) => text.toLowerCase().startsWith(`${s.toLowerCase()} `))
    .sort((a, b) => b.length - a.length)[0];
  const rest = service ? text.slice(service.length).trim() : text;
  const m = rest.match(/^(.*) \((.+)\)$/);
  return { service: service ?? "", device: m ? m[1] : rest, variant: m ? m[2] : null };
}


/**
 * Gợi ý bán hàng cho một chi nhánh: hàng quán khác ghi rõ "(hàng …)" (bán / tặng sẽ tự ghi sổ Mượn hàng),
 * hàng quán mình xếp trước. Giá đã trừ chương trình khuyến mãi đang chạy ở chi nhánh (giảm cao nhất),
 * kèm tên các ưu đãi để nhân viên báo khách. Kèm danh sách phụ kiện còn hàng để tặng kèm.
 */
export async function getSaleSuggestions(branchId: number) {
  const [{ sale, repair }, promos] = await Promise.all([getPriceSuggestions(), getRunningPromotions(branchId)]);
  const saleSuggestions = sale
    .map(({ match, ...s }): PriceSuggestion => {
      const { matched, best } = promotionsFor(promos, match, s.price);
      if (!matched.length) return s;
      return {
        ...s,
        listPrice: best ? s.price : undefined,
        price: s.price - (best?.amount ?? 0),
        promo: matched
          .map((p) => (p === best?.promo ? `${p.title}: ${discountText(p)}` : `${p.title}: ${p.summary}`))
          .join(" · "),
      };
    })
    .map((s) => (s.ownerBranchId && s.ownerBranchId !== branchId ? { ...s, label: `${s.label} (hàng ${s.ownerName})` } : s))
    // Hàng chưa gắn chi nhánh coi như của quán mình
    .sort(
      (a, b) =>
        Number((a.ownerBranchId ?? branchId) !== branchId) - Number((b.ownerBranchId ?? branchId) !== branchId),
    );
  const giftOptions = saleSuggestions.filter((s) => s.giftable && (s.quantity ?? 0) > 0);
  return { saleSuggestions, repairSuggestions: repair, giftOptions };
}

/** Tài khoản nhận chuyển khoản đã dùng gần đây — gợi ý khi nhập CK */
export async function getRecentBankAccounts() {
  const rows = await prisma.transaction.findMany({
    where: { bankAccount: { not: null } },
    select: { bankAccount: true },
    distinct: ["bankAccount"],
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return rows.map((r) => r.bankAccount!).filter(Boolean);
}
