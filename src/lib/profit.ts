type Tx = { kind: string; price: number; costPrice: number | null; giftCost?: number };

/**
 * Một công thức lãi duy nhất cho Dashboard và Báo cáo (trước đây hai trang tính khác nhau nên lệch số).
 * - Giá vốn = giá nhập chụp lúc bán (`Transaction.costPrice`) + giá nhập quà tặng kèm (`Transaction.giftCost`, bán 0 đ).
 * - Sửa chữa: chọn đúng loại trong bảng giá sửa chữa thì giá nhập linh kiện (`RepairPrice.costPrice`) được chụp vào
 *   `costPrice`; không có thì doanh thu sửa chữa tính hết vào lãi gộp (linh kiện ghi ở Chi phí nếu có).
 * - Bán / sửa chưa có giá vốn (ngoài bảng giá / chưa nhập giá) tạm tính giá vốn 0 → đếm vào `missingCost`
 *   để cảnh báo lãi có thể cao hơn thực tế; nhập bổ sung ở Báo cáo → Thiếu giá vốn.
 */
export function profitOf(txs: Tx[]) {
  let revenue = 0;
  let cogs = 0;
  let missingCost = 0;
  for (const t of txs) {
    revenue += t.price;
    cogs += t.giftCost ?? 0;
    if (t.costPrice != null) cogs += t.costPrice;
    else if (t.kind === "SALE" || t.kind === "REPAIR") missingCost++;
  }
  return { revenue, cogs, gross: revenue - cogs, missingCost };
}

/** % thay đổi so với kỳ trước; null khi kỳ trước bằng 0 (không so được). */
export function percentChange(current: number, previous: number | undefined) {
  return previous ? ((current - previous) / Math.abs(previous)) * 100 : null;
}
