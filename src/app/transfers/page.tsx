import { redirect } from "next/navigation";

/** Đường dẫn cũ: Nhập hàng → Hàng hoá / Phiếu nhập - chuyển */
export default async function OldTransfers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(qs ? `/products/receipts?${qs}` : "/products/receipts");
}
