type Tx = { kind: string; price: number; costPrice: number | null };

/**
 * Một công thức lãi duy nhất cho Dashboard và Báo cáo (trước đây hai trang tính khác nhau nên lệch số).
 * - Giá vốn = giá nhập chụp lúc bán (`Transaction.costPrice`).
 * - Sửa chữa không có giá vốn ở đây: linh kiện ghi vào Chi phí (trang Báo cáo) → doanh thu sửa chữa tính hết vào lãi gộp.
 * - Hàng bán chưa có giá nhập (bán ngoài bảng giá / sản phẩm chưa nhập giá) tạm tính giá vốn 0 → đếm vào `missingCost`
 *   để cảnh báo lãi có thể cao hơn thực tế.
 */
export function profitOf(txs: Tx[]) {
  let revenue = 0;
  let cogs = 0;
  let missingCost = 0;
  for (const t of txs) {
    revenue += t.price;
    if (t.costPrice != null) cogs += t.costPrice;
    else if (t.kind === "SALE") missingCost++;
  }
  return { revenue, cogs, gross: revenue - cogs, missingCost };
}

/** % thay đổi so với kỳ trước; null khi kỳ trước bằng 0 (không so được). */
export function percentChange(current: number, previous: number | undefined) {
  return previous ? ((current - previous) / Math.abs(previous)) * 100 : null;
}
