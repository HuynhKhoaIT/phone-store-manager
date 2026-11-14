import "server-only";
import { prisma } from "./db";
import { addMonths, dateVN, daysInMonth, todayVN } from "./format";
import { eachDay } from "./period";
import { summarize } from "./summary";
import type { DailyPoint } from "@/components/DailyRevenueChart";
import {
  DEFAULT_BONUS,
  KPI_METRICS,
  KPI_TEMPLATE_PRESETS,
  TARGET_TEMPLATE_PRESETS,
  parseTemplateTargets,
  computeActuals,
  computePayout,
  evaluate,
  parseGroups,
  parseParts,
  parseWeights,
  type Actuals,
  type BonusConfig,
  type KpiTx,
  type MetricKey,
  type PerfFacts,
} from "./kpi-metrics";

/** Cấu hình thưởng đang áp dụng cho tháng: dòng `fromMonth` gần nhất ≤ tháng đó, chưa có thì mặc định */
export async function getBonusConfig(month: string): Promise<BonusConfig & { fromMonth: string | null }> {
  const row = await prisma.kpiBonusConfig.findFirst({
    where: { fromMonth: { lte: month } },
    orderBy: { fromMonth: "desc" },
  });
  if (!row) return { ...DEFAULT_BONUS, fromMonth: null };
  return toBonusConfig(row);
}

type ConfigRow = {
  parts: unknown;
  partsEnabled: boolean;
  maxTotal: number | null;
  groups: unknown;
  targetWeights: unknown;
  targetGrowthPct: number;
};

/** Dòng KpiBonusConfig / KpiTemplate → BonusConfig (JSON sai thì lấy mặc định thay vì lỗi trang) */
export function toConfig(row: ConfigRow): BonusConfig {
  return {
    partsEnabled: row.partsEnabled,
    parts: parseParts(row.parts) ?? DEFAULT_BONUS.parts,
    maxTotal: row.maxTotal,
    groups: parseGroups(row.groups),
    targetWeights: parseWeights(row.targetWeights),
    targetGrowthPct: row.targetGrowthPct,
  };
}

export function toBonusConfig(row: ConfigRow & { fromMonth: string }) {
  return { ...toConfig(row), fromMonth: row.fromMonth };
}

/** Mẫu cấu hình thưởng; chưa có mẫu nào thì tạo sẵn từ KPI_TEMPLATE_PRESETS (an toàn khi gọi nhiều lần) */
export async function getKpiTemplates() {
  if ((await prisma.kpiTemplate.count()) === 0)
    await prisma.kpiTemplate.createMany({
      data: KPI_TEMPLATE_PRESETS.map((t, i) => ({
        name: t.name,
        description: t.description,
        parts: t.parts,
        partsEnabled: t.partsEnabled,
        maxTotal: t.maxTotal,
        groups: t.groups,
        targetWeights: t.targetWeights,
        targetGrowthPct: t.targetGrowthPct,
        sortOrder: i,
        updatedBy: "Hệ thống",
      })),
      skipDuplicates: true,
    });
  const rows = await prisma.kpiTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, updatedBy: r.updatedBy, config: toConfig(r) }));
}

/** Mẫu bộ chỉ tiêu; chưa có mẫu nào thì tạo sẵn từ TARGET_TEMPLATE_PRESETS (an toàn khi gọi nhiều lần) */
export async function getTargetTemplates() {
  if ((await prisma.kpiTargetTemplate.count()) === 0)
    await prisma.kpiTargetTemplate.createMany({
      data: TARGET_TEMPLATE_PRESETS.map((t, i) => ({ ...t, sortOrder: i, updatedBy: "Hệ thống" })),
      skipDuplicates: true,
    });
  const rows = await prisma.kpiTargetTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, targets: parseTemplateTargets(r.targets) }));
}

export type StaffKpi = Awaited<ReturnType<typeof loadKpiMonth>>["staff"][number];

/**
 * Toàn bộ số liệu KPI của một tháng: mỗi nhân viên (có chỉ tiêu hoặc có làm ca trong tháng) gồm số thực tế,
 * chỉ tiêu, % hoàn thành, các điều kiện thưởng (checklist, tiền ca, đánh giá), thưởng dự kiến, doanh thu theo ngày.
 * Dùng chung cho Dashboard KPI, chi tiết, KPI của tôi. `userId`: chỉ lấy một nhân viên.
 */
export async function loadKpiMonth(month: string, opts: { userId?: number } = {}) {
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const byUser = opts.userId ? { userId: opts.userId } : {};
  const [txs, targets, bonus, shifts, reviews, tasks, checks] = await Promise.all([
    prisma.transaction.findMany({
      where: { shift: { date: { gte: from, lte: to }, ...byUser } },
      select: {
        kind: true,
        price: true,
        costPrice: true,
        giftCost: true,
        category: true,
        customerPhone: true,
        product: { select: { category: true } },
        shift: { select: { date: true, userId: true, branchId: true } },
      },
    }),
    prisma.kpiTarget.findMany({ where: { month, ...byUser } }),
    getBonusConfig(month),
    // Ca của nhân viên: ngày đi làm (checklist) + tiền mặt lúc chốt ca (thiếu tiền)
    prisma.shift.findMany({
      where: { date: { gte: from, lte: to }, userId: opts.userId ?? { not: null } },
      select: {
        date: true,
        branchId: true,
        userId: true,
        openingCash: true,
        handoverCash: true,
        closedAt: true,
        transactions: {
          select: { kind: true, price: true, paymentMethod: true, bankAccount: true, financeCompany: true, downPayment: true },
        },
        financePayments: { select: { amount: true, paymentMethod: true, bankAccount: true } },
      },
    }),
    prisma.kpiReview.findMany({ where: { month, ...byUser } }),
    prisma.checklistTask.findMany({ select: { id: true, branchId: true, active: true, createdAt: true } }),
    prisma.checklistCheck.findMany({ where: { date: { gte: from, lte: to } }, select: { taskId: true, date: true, branchId: true } }),
  ]);

  // Hỏi một nhân viên thì luôn trả về người đó, kể cả tháng chưa có ca / chỉ tiêu
  const userIds = new Set<number>(opts.userId ? [opts.userId] : targets.map((t) => t.userId));
  for (const s of shifts) if (s.userId != null) userIds.add(s.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] }, role: "STAFF" },
    select: { id: true, name: true, active: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const taskCreated = new Map(tasks.map((t) => [t.id, dateVN(t.createdAt)]));
  const checkKeys = new Set(checks.map((c) => `${c.taskId}|${c.date}|${c.branchId}`));
  const today = todayVN();

  const days = eachDay(from, to);
  const staff = users.map((u) => {
    const mine = txs.filter((t) => t.shift.userId === u.id);
    const myShifts = shifts.filter((s) => s.userId === u.id);
    const actuals = computeActuals(mine.map(toKpiTx));
    const userTargets = targets.filter((t) => t.userId === u.id);
    const { rows, completion } = evaluate(userTargets, actuals);
    const review = reviews.find((r) => r.userId === u.id);

    // Checklist: việc của chi nhánh trong các ngày đã làm xong (bỏ hôm nay — đang làm dở).
    // Việc tính cho ngày đó nếu đã tạo trước / trong ngày và (còn dùng, hoặc đã từng được tick ngày đó)
    let checklistDone = 0;
    let checklistTotal = 0;
    const workDays = new Set(myShifts.filter((s) => s.date < today).map((s) => `${s.date}|${s.branchId}`));
    for (const key of workDays) {
      const [date, branch] = key.split("|");
      for (const t of tasks) {
        if (t.branchId != null && t.branchId !== Number(branch)) continue;
        if ((taskCreated.get(t.id) ?? "") > date) continue;
        const done = checkKeys.has(`${t.id}|${date}|${branch}`);
        if (!t.active && !done) continue;
        checklistTotal++;
        if (done) checklistDone++;
      }
    }
    // Thiếu tiền ca: tiền mặt bàn giao − (đầu ca + tiền mặt thu trong ca), chỉ ca đã chốt
    let maxCashShort = 0;
    const closed = myShifts.filter((s) => s.closedAt && s.handoverCash != null);
    for (const s of closed) {
      const diff = s.handoverCash! - (s.openingCash + summarize(s.transactions, s.financePayments).cash);
      maxCashShort = Math.max(maxCashShort, -diff);
    }
    const facts: PerfFacts = {
      checklistDone,
      checklistTotal,
      maxCashShort,
      closedShifts: closed.length,
      review: review ? { passed: review.passed, note: review.note, reviewedBy: review.reviewedBy } : null,
    };

    const payout = computePayout({ rows, actuals, completion, facts }, bonus);
    const daily: DailyPoint[] = days.map((date) => ({ date, sale: 0, repair: 0 }));
    for (const t of mine) {
      const d = daily[days.indexOf(t.shift.date)];
      if (!d) continue;
      if (t.kind === "SALE") d.sale += t.price;
      else if (t.kind === "REPAIR") d.repair += t.price;
    }
    return {
      user: u,
      actuals,
      rows,
      /** Chỉ tiêu đã đặt (kể cả đang tắt) — cho form thiết lập */
      targets: userTargets,
      completion,
      facts,
      /** Thưởng dự kiến: từng khoản (phần A / B / C / trần) + tổng */
      payout,
      daily,
      branchIds: [...new Set(myShifts.map((s) => s.branchId))],
    };
  });

  return { month, from, to, bonusConfig: bonus, staff, storeTxs: txs };
}

/**
 * Chỉ tiêu gợi ý cho tháng: trung bình các tháng có đi làm trong 3 tháng trước × `growthPct`% (lãi gộp giữ nguyên TB —
 * dùng làm chốt chặn). Tiền làm tròn 500.000 đ, số lượng làm tròn lên. null = chưa có lịch sử.
 */
export async function suggestTargets(userIds: number[], month: string, growthPct: number) {
  const from = `${addMonths(month, -3)}-01`;
  const to = `${addMonths(month, -1)}-31`;
  const [txs, shifts] = await Promise.all([
    prisma.transaction.findMany({
      where: { shift: { date: { gte: from, lte: to }, userId: { in: userIds } } },
      select: {
        kind: true,
        price: true,
        costPrice: true,
        giftCost: true,
        category: true,
        customerPhone: true,
        product: { select: { category: true } },
        shift: { select: { date: true, userId: true } },
      },
    }),
    prisma.shift.findMany({ where: { date: { gte: from, lte: to }, userId: { in: userIds } }, select: { date: true, userId: true } }),
  ]);
  const out = new Map<number, Partial<Record<MetricKey, number>> | null>();
  for (const id of userIds) {
    const months = [...new Set(shifts.filter((s) => s.userId === id).map((s) => s.date.slice(0, 7)))];
    if (!months.length) {
      out.set(id, null);
      continue;
    }
    const sums = Object.fromEntries(KPI_METRICS.map((m) => [m.key, 0])) as Record<MetricKey, number>;
    for (const m of months) {
      const a = computeActuals(txs.filter((t) => t.shift.userId === id && t.shift.date.startsWith(m)).map(toKpiTx));
      for (const k of KPI_METRICS) sums[k.key] += a[k.key];
    }
    const suggestion: Partial<Record<MetricKey, number>> = {};
    for (const m of KPI_METRICS) {
      const avg = (sums[m.key] / months.length) * (m.key === "GROSS_PROFIT" ? 1 : growthPct / 100);
      const v = m.money ? Math.round(avg / 500_000) * 500_000 : Math.ceil(avg);
      if (v > 0) suggestion[m.key] = v;
    }
    out.set(id, suggestion);
  }
  return out;
}

/** Đơn bán gõ tay chưa phân loại của một nhân viên trong tháng (để phân loại Điện thoại / Phụ kiện) */
export async function getUnclassifiedSales(month: string, userId: number) {
  const rows = await prisma.transaction.findMany({
    where: { kind: "SALE", category: null, productId: null, shift: { date: { startsWith: month }, userId } },
    select: { id: true, productName: true, price: true, shift: { select: { date: true } } },
    orderBy: [{ shift: { date: "asc" } }, { id: "asc" }],
  });
  return rows.map((t) => ({ id: t.id, productName: t.productName, price: t.price, date: t.shift.date }));
}

export function toKpiTx(t: {
  kind: string;
  price: number;
  costPrice: number | null;
  giftCost: number;
  category: string | null;
  customerPhone: string | null;
  product: { category: string } | null;
  shift: { date: string };
}): KpiTx {
  return {
    kind: t.kind,
    price: t.price,
    costPrice: t.costPrice,
    giftCost: t.giftCost,
    category: t.category,
    productCategory: t.product?.category ?? null,
    customerPhone: t.customerPhone,
    date: t.shift.date,
  };
}

export type { Actuals };
