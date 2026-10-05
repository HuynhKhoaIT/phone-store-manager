type Tx = { kind: string; price: number; paymentMethod: string; bankAccount: string | null };

export function summarize(txs: Tx[]) {
  let total = 0, sale = 0, repair = 0, cash = 0, transfer = 0;
  const byAccount = new Map<string, number>();
  for (const t of txs) {
    total += t.price;
    if (t.kind === "REPAIR") repair += t.price;
    else sale += t.price;
    if (t.paymentMethod === "TRANSFER") {
      transfer += t.price;
      const acc = t.bankAccount || "(không ghi)";
      byAccount.set(acc, (byAccount.get(acc) ?? 0) + t.price);
    } else cash += t.price;
  }
  return { total, sale, repair, cash, transfer, count: txs.length, byAccount: [...byAccount] };
}
