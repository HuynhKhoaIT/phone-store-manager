import "server-only";
import { prisma } from "./db";
import { addDays, todayVN } from "./format";
import { profitOf } from "./profit";

export const CAPITAL_TYPE_LABEL: Record<string, string> = { CONTRIBUTE: "Góp vốn", WITHDRAW: "Rút tiền" };

/** Lãi ròng TB tính trên chừng này ngày gần nhất để ước tính thời gian hoà vốn */
export const RECENT_DAYS = 90;
/** Ít hơn số ngày dữ liệu này thì chưa ước tính */
const MIN_DAYS_FOR_ESTIMATE = 14;

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Số liệu vốn / hoà vốn dùng chung cho Báo cáo › Hoà vốn và Báo cáo › Góp vốn.
 * - Vốn đầu tư chi nhánh = tổng tiền góp vào chi nhánh đó.
 * - Đã thu hồi = lãi ròng cộng dồn từ ngày bắt đầu (cùng công thức tab Lãi lỗ: lib/profit.ts − chi phí chi nhánh).
 * - Mỗi người được chia lãi theo tỉ lệ vốn góp ở từng chi nhánh. Tiền rút không phải chi phí nên không trừ vào lãi.
 * - Chi phí chung (không gắn chi nhánh) không chia cho chi nhánh nào — chỉ trừ ở phần tổng.
 */
export async function getCapitalReport() {
  const today = todayVN();
  const [branches, firstShifts, entries, investors] = await Promise.all([
    prisma.branch.findMany({
      select: { id: true, name: true, active: true, openedAt: true },
      orderBy: [{ active: "desc" }, { id: "asc" }],
    }),
    prisma.shift.groupBy({ by: ["branchId"], _min: { date: true } }),
    prisma.capitalEntry.findMany({ select: { investorId: true, branchId: true, type: true, amount: true } }),
    prisma.investor.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }] }),
  ]);
  const firstShift = new Map(firstShifts.map((s) => [s.branchId, s._min.date]));
  const sumBy = (filter: (e: (typeof entries)[number]) => boolean) =>
    entries.filter(filter).reduce((s, e) => s + e.amount, 0);

  const withCapital = branches
    .map((b) => ({
      ...b,
      start: b.openedAt ?? firstShift.get(b.id) ?? today,
      investment: sumBy((e) => e.branchId === b.id && e.type === "CONTRIBUTE"),
      withdrawn: sumBy((e) => e.branchId === b.id && e.type === "WITHDRAW"),
    }))
    // Chi nhánh đã đóng mà chưa từng có vốn thì không cần hiện
    .filter((b) => b.active || b.investment > 0);
  const earliest = withCapital.reduce((min, b) => (b.start < min ? b.start : min), today);

  const [txs, expenses] = await Promise.all([
    prisma.transaction.findMany({
      where: { shift: { date: { gte: earliest } } },
      select: { kind: true, price: true, costPrice: true, shift: { select: { date: true, branchId: true } } },
    }),
    prisma.expense.findMany({ where: { date: { gte: earliest } }, select: { date: true, branchId: true, amount: true } }),
  ]);
  const netOf = (branchId: number, from: string) =>
    profitOf(txs.filter((t) => t.shift.branchId === branchId && t.shift.date >= from)).gross -
    expenses.filter((e) => e.branchId === branchId && e.date >= from).reduce((s, e) => s + e.amount, 0);

  const branchRows = withCapital.map((b) => {
    const net = netOf(b.id, b.start);
    const remaining = Math.max(0, b.investment - net);
    // Ước tính: lãi ròng TB/tháng của 90 ngày gần nhất (hoặc từ ngày bắt đầu nếu mới mở)
    const recentFrom = [b.start, addDays(today, -(RECENT_DAYS - 1))].sort().at(-1)!;
    const recentDays = daysBetween(recentFrom, today);
    const monthly = recentDays >= MIN_DAYS_FOR_ESTIMATE ? (netOf(b.id, recentFrom) / recentDays) * 30 : null;
    const monthsLeft = remaining > 0 && monthly && monthly > 0 ? Math.ceil(remaining / monthly) : null;
    const contributors = investors
      .map((inv) => {
        const amount = sumBy((e) => e.branchId === b.id && e.investorId === inv.id && e.type === "CONTRIBUTE");
        return { investorId: inv.id, name: inv.name, amount, share: b.investment > 0 ? amount / b.investment : 0 };
      })
      .filter((c) => c.amount > 0)
      .sort((x, y) => y.amount - x.amount);
    return { ...b, net, remaining, monthly, monthsLeft, contributors };
  });

  const investorRows = investors.map((inv) => {
    const perBranch = branchRows
      .map((b) => {
        const c = b.contributors.find((x) => x.investorId === inv.id);
        const withdrawn = sumBy((e) => e.branchId === b.id && e.investorId === inv.id && e.type === "WITHDRAW");
        return {
          branchId: b.id,
          branchName: b.name,
          contributed: c?.amount ?? 0,
          share: c?.share ?? 0,
          profitShare: Math.round((c?.share ?? 0) * b.net),
          withdrawn,
        };
      })
      .filter((x) => x.contributed > 0 || x.withdrawn > 0);
    const contributed = perBranch.reduce((s, x) => s + x.contributed, 0);
    const withdrawn = perBranch.reduce((s, x) => s + x.withdrawn, 0);
    const profitShare = perBranch.reduce((s, x) => s + x.profitShare, 0);
    return {
      ...inv,
      perBranch,
      contributed,
      withdrawn,
      profitShare,
      /** Phần vốn góp chưa rút về */
      unrecovered: Math.max(0, contributed - withdrawn),
      /** Vốn góp + lãi được chia − đã rút */
      balance: contributed + profitShare - withdrawn,
    };
  });

  const sharedExpense = expenses.filter((e) => e.branchId == null).reduce((s, e) => s + e.amount, 0);
  const invested = branchRows.filter((b) => b.investment > 0);
  const total = {
    investment: invested.reduce((s, b) => s + b.investment, 0),
    net: invested.reduce((s, b) => s + b.net, 0) - sharedExpense,
    withdrawn: branchRows.reduce((s, b) => s + b.withdrawn, 0),
  };
  return { today, branches: branchRows, investors: investorRows, sharedExpense, total };
}
