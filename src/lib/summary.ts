type Tx = {
  kind: string;
  price: number;
  paymentMethod: string;
  bankAccount: string | null;
  financeCompany?: string | null;
  downPayment?: number | null;
};
/** Tiền trả góp thu trong ca (InstallmentPayment) — chỉ là tiền vào, không phải doanh thu mới */
type Collected = { amount: number; paymentMethod: string; bankAccount: string | null };

/**
 * Tổng hợp doanh thu + tiền vào.
 * - total / sale / repair: doanh thu (bán trả góp tính đủ giá bán ngay ngày bán).
 * - cash / transfer: tiền thực nhận — bán trả góp chỉ tính tiền khách trả trước, cộng tiền trả góp thu được (`collected`).
 * - financed: phần công ty tài chính trả sau của các giao dịch trả góp trong danh sách.
 */
export function summarize(txs: Tx[], collected: Collected[] = []) {
  let total = 0, sale = 0, repair = 0, cash = 0, transfer = 0, financed = 0, collectedTotal = 0;
  const byAccount = new Map<string, number>();
  const receive = (amount: number, method: string, account: string | null) => {
    if (amount <= 0) return;
    if (method === "TRANSFER") {
      transfer += amount;
      const acc = account || "(không ghi)";
      byAccount.set(acc, (byAccount.get(acc) ?? 0) + amount);
    } else cash += amount;
  };
  for (const t of txs) {
    total += t.price;
    if (t.kind === "REPAIR") repair += t.price;
    else sale += t.price;
    const received = t.financeCompany ? Math.min(t.downPayment ?? 0, t.price) : t.price;
    financed += t.price - received;
    receive(received, t.paymentMethod, t.bankAccount);
  }
  for (const c of collected) {
    collectedTotal += c.amount;
    receive(c.amount, c.paymentMethod, c.bankAccount);
  }
  return {
    total, sale, repair, cash, transfer, financed, collected: collectedTotal,
    count: txs.length, byAccount: [...byAccount],
  };
}
