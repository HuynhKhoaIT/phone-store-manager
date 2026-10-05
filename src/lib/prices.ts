import { prisma } from "./db";
import type { PriceSuggestion } from "@/components/TransactionFields";

export const CATEGORY_LABEL: Record<string, string> = {
  IPHONE: "iPhone",
  ANDROID: "Android",
  ACCESSORY: "Phụ kiện",
};

export const CONDITION_LABEL: Record<string, string> = { NEW: "Mới", USED: "Cũ 99%" };

export function productLabel(p: { name: string; variant: string | null; condition: string }) {
  return [p.name, p.variant, p.condition === "USED" ? "(Cũ)" : null].filter(Boolean).join(" ");
}

/** Gợi ý tên + giá khi nhập giao dịch, lấy từ bảng giá. */
export async function getPriceSuggestions() {
  const [products, repairs] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.repairPrice.findMany({ orderBy: [{ device: "asc" }, { service: "asc" }] }),
  ]);
  const sale: PriceSuggestion[] = products.map((p) => ({
    label: productLabel(p),
    price: p.price,
    warrantyMonths: p.warrantyMonths,
  }));
  const repair: PriceSuggestion[] = repairs.map((r) => ({ label: `${r.service} ${r.device}`, price: r.price }));
  return { sale, repair };
}
