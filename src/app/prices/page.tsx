import { redirect } from "next/navigation";

/** Đường dẫn cũ: Bảng giá → Hàng hoá */
export default async function OldPrices({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const qs = new URLSearchParams(await searchParams).toString();
  redirect(qs ? `/products?${qs}` : "/products");
}
