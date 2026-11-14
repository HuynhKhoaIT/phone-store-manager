/**
 * KPI & thưởng doanh số — phần tính toán thuần, dùng chung server / client (không import gì từ server).
 *
 * Nguyên tắc ghi nhận (đã chốt với chủ cửa hàng):
 * - Doanh số tính cho **người trực ca** (`Shift.userId`), gộp mọi chi nhánh người đó làm trong tháng.
 *   Admin nhập giao dịch vào ca của nhân viên thì vẫn tính cho nhân viên đó.
 * - Mỗi `Transaction` là một món nên không có chuyện tính trùng doanh thu một đơn nhiều sản phẩm.
 * - Đơn huỷ / hoàn = admin xoá giao dịch → tự biến khỏi KPI. Đổi bảo hành (`WARRANTY`), SIM, nạp card không tính.
 * - Trả góp: đủ giá bán vào ngày bán (khớp Dashboard).
 * - Lãi gộp chỉ tính trên đơn đã có giá vốn; đơn thiếu giá vốn đếm riêng để cảnh báo, không tạm tính bằng 0.
 * - Điện thoại đặt chỉ tiêu theo **số máy** (PHONE_COUNT); doanh thu điện thoại vẫn có để xem / đặt nếu muốn.
 *
 * Thưởng (xem DEFAULT_BONUS): A = thưởng theo PHẦN, cộng dồn các phần đạt (mỗi phần là một nhóm điều kiện phải đạt hết);
 * B / C = hoa hồng doanh thu hoặc % lãi gộp theo nhóm hàng (mỗi nhóm một cách); tổng mọi khoản không vượt `maxTotal`.
 */

export const KPI_METRICS = [
  { key: "PHONE_COUNT", label: "Số điện thoại bán ra", unit: "máy", money: false },
  { key: "ACCESSORY_REVENUE", label: "Doanh thu phụ kiện", unit: "đ", money: true },
  { key: "REPAIR_REVENUE", label: "Doanh thu sửa chữa", unit: "đ", money: true },
  { key: "GROSS_PROFIT", label: "Lợi nhuận gộp", unit: "đ", money: true },
  { key: "PHONE_REVENUE", label: "Doanh thu điện thoại", unit: "đ", money: true, note: "Điện thoại nên đặt theo số máy — thường không cần" },
  { key: "ORDER_COUNT", label: "Số đơn thành công", unit: "đơn", money: false, note: "Đếm lại các đơn đã có trong số máy / phụ kiện / sửa chữa — thường không cần" },
  { key: "CUSTOMER_COUNT", label: "Số khách lưu thông tin", unit: "khách", money: false },
] as const;

export type MetricKey = (typeof KPI_METRICS)[number]["key"];

/** Chỉ tiêu doanh thu — cộng vào "Tổng chỉ tiêu doanh thu" ở Dashboard KPI (không chồng lên nhau) */
export const REVENUE_METRICS: MetricKey[] = ["PHONE_REVENUE", "ACCESSORY_REVENUE", "REPAIR_REVENUE"];

export const metricInfo = (key: string) => KPI_METRICS.find((m) => m.key === key);
/** Ghi chú khi đặt chỉ tiêu (chỉ tiêu trùng lặp, không nên dùng) */
export const metricNote = (key: string) => {
  const m = metricInfo(key);
  return m && "note" in m ? m.note : undefined;
};
export const isMetric = (key: string): key is MetricKey => KPI_METRICS.some((m) => m.key === key);

/** Mỗi chỉ tiêu tính tối đa 150% khi gộp % chung — một chỉ tiêu vượt xa không gánh hết các chỉ tiêu còn lại */
export const METRIC_CAP = 1.5;

/**
 * Chỉ tiêu mặc định khi đặt KPI lần đầu (form gợi ý = TB 3 tháng gần nhất × 105%): trọng số; điện thoại tính theo số máy.
 * Sửa chữa chỉ bật khi nhân viên có làm sửa chữa.
 */
export const DEFAULT_TARGET_WEIGHTS: Partial<Record<MetricKey, number>> = {
  PHONE_COUNT: 2,
  ACCESSORY_REVENUE: 1,
  REPAIR_REVENUE: 1,
  GROSS_PROFIT: 1,
};

/** Mức chỉ tiêu gợi ý so với trung bình 3 tháng, % (lãi gộp giữ nguyên trung bình — chỉ là chốt chặn). Đổi theo cấu hình tháng */
export const DEFAULT_TARGET_GROWTH_PCT = 105;

/** Đọc trọng số chỉ tiêu mặc định từ JSON (null / sai = DEFAULT_TARGET_WEIGHTS) */
export function parseWeights(json: unknown): Partial<Record<MetricKey, number>> {
  if (!json || typeof json !== "object") return DEFAULT_TARGET_WEIGHTS;
  const out: Partial<Record<MetricKey, number>> = {};
  for (const [k, v] of Object.entries(json)) {
    const w = Number(v);
    if (isMetric(k) && Number.isInteger(w) && w >= 1 && w <= 10) out[k] = w;
  }
  return out;
}

export const CATEGORY_LABEL: Record<string, string> = { PHONE: "Điện thoại", ACCESSORY: "Phụ kiện" };

/** Loại hàng của sản phẩm trong bảng giá → loại hàng của giao dịch bán */
export function categoryOfProduct(productCategory: string | null | undefined) {
  if (productCategory === "IPHONE" || productCategory === "ANDROID") return "PHONE";
  if (productCategory === "ACCESSORY") return "ACCESSORY";
  return null;
}

export type KpiTx = {
  kind: string;
  price: number;
  costPrice: number | null;
  giftCost: number;
  category: string | null;
  /** `Product.category` của sản phẩm gắn kèm (đơn cũ chưa có `category`) */
  productCategory: string | null;
  customerPhone: string | null;
  /** Ngày của ca (YYYY-MM-DD) — để tính bán kèm cùng ngày */
  date: string;
};

/** PHONE | ACCESSORY | null (không phải bán hàng, hoặc bán gõ tay chưa phân loại) */
export function txCategory(t: Pick<KpiTx, "kind" | "category" | "productCategory">) {
  if (t.kind !== "SALE") return null;
  return t.category === "PHONE" || t.category === "ACCESSORY" ? t.category : categoryOfProduct(t.productCategory);
}

/** Nhóm hàng để tính hoa hồng / thưởng lợi nhuận (phương án B / C) */
export const BONUS_GROUPS = [
  { key: "PHONE", label: "Điện thoại" },
  { key: "ACCESSORY", label: "Phụ kiện" },
  { key: "REPAIR", label: "Sửa chữa" },
] as const;

export type BonusGroup = (typeof BONUS_GROUPS)[number]["key"];

export type GroupActual = {
  revenue: number;
  /** Lãi gộp của các đơn đã có giá vốn */
  profit: number;
  /** Đơn chưa có giá vốn — có thì không tính thưởng theo lợi nhuận của nhóm */
  missingCost: number;
};

export type Actuals = Record<MetricKey, number> & {
  /** Theo nhóm hàng — cơ sở tính hoa hồng / thưởng lợi nhuận */
  groups: Record<BonusGroup, GroupActual>;
  /** Doanh thu bán + sửa (bảng xếp hạng) */
  revenue: number;
  /** Bán hàng chưa phân loại điện thoại / phụ kiện */
  unclassified: number;
  unclassifiedRevenue: number;
  /** Bán / sửa chưa có giá vốn — không tính vào lãi gộp */
  missingCost: number;
  /** Máy bán ra có khách mua thêm phụ kiện (cùng SĐT, cùng ngày, cùng nhân viên) — tỉ lệ bán kèm = attached / PHONE_COUNT */
  attached: number;
};

/** Số liệu thực tế của một nhân viên từ các giao dịch trong kỳ */
export function computeActuals(txs: KpiTx[]): Actuals {
  const a: Actuals = {
    PHONE_REVENUE: 0,
    ACCESSORY_REVENUE: 0,
    REPAIR_REVENUE: 0,
    PHONE_COUNT: 0,
    GROSS_PROFIT: 0,
    ORDER_COUNT: 0,
    CUSTOMER_COUNT: 0,
    groups: {
      PHONE: { revenue: 0, profit: 0, missingCost: 0 },
      ACCESSORY: { revenue: 0, profit: 0, missingCost: 0 },
      REPAIR: { revenue: 0, profit: 0, missingCost: 0 },
    },
    revenue: 0,
    unclassified: 0,
    unclassifiedRevenue: 0,
    missingCost: 0,
    attached: 0,
  };
  const phones = new Set<string>();
  // Bán kèm: phụ kiện có SĐT khách (quà tặng không tính — quà là TransactionGift, không phải đơn bán)
  const accessoryBuyers = new Set<string>();
  const phoneSales: string[] = [];
  for (const t of txs) {
    if (t.kind !== "SALE" && t.kind !== "REPAIR") continue;
    a.ORDER_COUNT++;
    a.revenue += t.price;
    if (t.customerPhone) phones.add(t.customerPhone);
    const profit = t.costPrice == null ? null : t.price - t.costPrice - t.giftCost;
    if (profit == null) a.missingCost++;
    else a.GROSS_PROFIT += profit;
    const group: BonusGroup | null = t.kind === "REPAIR" ? "REPAIR" : txCategory(t);
    if (group === "REPAIR") a.REPAIR_REVENUE += t.price;
    else if (group === "PHONE") {
      a.PHONE_REVENUE += t.price;
      a.PHONE_COUNT++;
      if (t.customerPhone) phoneSales.push(`${t.date}|${t.customerPhone}`);
    } else if (group === "ACCESSORY") {
      a.ACCESSORY_REVENUE += t.price;
      if (t.customerPhone) accessoryBuyers.add(`${t.date}|${t.customerPhone}`);
    } else {
      a.unclassified++;
      a.unclassifiedRevenue += t.price;
    }
    if (group) {
      const g = a.groups[group];
      g.revenue += t.price;
      if (profit == null) g.missingCost++;
      else g.profit += profit;
    }
  }
  a.CUSTOMER_COUNT = phones.size;
  a.attached = phoneSales.filter((k) => accessoryBuyers.has(k)).length;
  return a;
}

export type TargetInput = { metric: string; target: number; weight: number; active: boolean };

/** Một chỉ tiêu trong mẫu bộ chỉ tiêu */
export type TemplateTarget = { metric: MetricKey; target: number; weight: number };

/** Đọc danh sách chỉ tiêu của mẫu từ JSON (bỏ dòng sai) */
export function parseTemplateTargets(json: unknown): TemplateTarget[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((t) => ({ metric: String(t?.metric), target: Number(t?.target), weight: Number(t?.weight ?? 1) }))
    .filter((t): t is TemplateTarget => isMetric(t.metric) && Number.isSafeInteger(t.target) && t.target > 0 && Number.isInteger(t.weight));
}

/**
 * Mẫu bộ chỉ tiêu tạo sẵn (lần đầu mở trang Chỉ tiêu khi chưa có mẫu nào). Số liệu là ví dụ cho 1 nhân viên / 26 ngày công —
 * admin sửa theo thực tế quán. Mẫu nào cũng có Lợi nhuận gộp vì phần thưởng 1 mặc định cần chỉ tiêu này.
 */
export const TARGET_TEMPLATE_PRESETS: { name: string; description: string; targets: TemplateTarget[] }[] = [
  {
    name: "Bán hàng – quán mới",
    description: "Quán mới, khách chưa nhiều: thưởng việc kiếm khách (số khách ×2) ngang việc bán máy.",
    targets: [
      { metric: "PHONE_COUNT", target: 10, weight: 2 },
      { metric: "CUSTOMER_COUNT", target: 40, weight: 2 },
      { metric: "ACCESSORY_REVENUE", target: 10_000_000, weight: 1 },
      { metric: "GROSS_PROFIT", target: 12_000_000, weight: 1 },
    ],
  },
  {
    name: "Bán hàng – ổn định",
    description: "Quán đã có khách đều: tập trung số máy và phụ kiện.",
    targets: [
      { metric: "PHONE_COUNT", target: 15, weight: 2 },
      { metric: "ACCESSORY_REVENUE", target: 15_000_000, weight: 1 },
      { metric: "GROSS_PROFIT", target: 20_000_000, weight: 1 },
      { metric: "CUSTOMER_COUNT", target: 50, weight: 1 },
    ],
  },
  {
    name: "Kỹ thuật sửa chữa",
    description: "Thợ sửa chữa: doanh thu sửa chữa là chính, bán thêm phụ kiện cho khách sửa máy.",
    targets: [
      { metric: "REPAIR_REVENUE", target: 30_000_000, weight: 2 },
      { metric: "GROSS_PROFIT", target: 15_000_000, weight: 1 },
      { metric: "ACCESSORY_REVENUE", target: 5_000_000, weight: 1 },
      { metric: "CUSTOMER_COUNT", target: 40, weight: 1 },
    ],
  },
  {
    name: "Bán hàng + sửa chữa",
    description: "Nhân viên vừa đứng quầy vừa nhận sửa.",
    targets: [
      { metric: "PHONE_COUNT", target: 8, weight: 2 },
      { metric: "REPAIR_REVENUE", target: 15_000_000, weight: 1 },
      { metric: "ACCESSORY_REVENUE", target: 8_000_000, weight: 1 },
      { metric: "GROSS_PROFIT", target: 15_000_000, weight: 1 },
    ],
  },
  {
    name: "Nhân viên mới (thử việc)",
    description: "Tháng đầu đi làm: mục tiêu thấp để làm quen, khuyến khích xin SĐT khách.",
    targets: [
      { metric: "PHONE_COUNT", target: 5, weight: 2 },
      { metric: "CUSTOMER_COUNT", target: 30, weight: 2 },
      { metric: "ACCESSORY_REVENUE", target: 5_000_000, weight: 1 },
      { metric: "GROSS_PROFIT", target: 6_000_000, weight: 1 },
    ],
  },
];

export type MetricRow = {
  metric: MetricKey;
  label: string;
  unit: string;
  money: boolean;
  target: number;
  weight: number;
  actual: number;
  /** Còn thiếu để đạt (0 khi đã đạt) */
  remaining: number;
  /** thực tế / mục tiêu (chưa áp trần) */
  ratio: number;
};

/** Ghép chỉ tiêu đang bật với số liệu thực tế; % chung = Σ(trọng số × min(tỉ lệ, 150%)) / Σ trọng số */
export function evaluate(targets: TargetInput[], actuals: Actuals) {
  const rows: MetricRow[] = [];
  for (const t of targets) {
    const info = metricInfo(t.metric);
    if (!info || !t.active || t.target <= 0) continue;
    const actual = actuals[info.key];
    rows.push({
      metric: info.key,
      label: info.label,
      unit: info.unit,
      money: info.money,
      target: t.target,
      weight: t.weight,
      actual,
      remaining: Math.max(0, t.target - actual),
      ratio: actual / t.target,
    });
  }
  rows.sort((x, y) => KPI_METRICS.findIndex((m) => m.key === x.metric) - KPI_METRICS.findIndex((m) => m.key === y.metric));
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  const completion = totalWeight
    ? rows.reduce((s, r) => s + r.weight * Math.min(r.ratio, METRIC_CAP), 0) / totalWeight
    : null;
  return { rows, completion };
}

/* ---------------- Thưởng theo phần (phương án A) ---------------- */

export const CONDITION_TYPES = [
  { key: "COMPLETION_PCT", label: "% hoàn thành KPI chung", unit: "%" },
  { key: "METRIC_PCT", label: "Một chỉ tiêu đạt % mục tiêu", unit: "%" },
  { key: "REVENUE_PCT", label: "Doanh thu bán + sửa đạt % tổng chỉ tiêu doanh thu", unit: "%" },
  { key: "ATTACH_RATE", label: "Tỉ lệ bán kèm phụ kiện (máy có kèm / máy bán)", unit: "%" },
  { key: "CHECKLIST_RATE", label: "Checklist hoàn thành các ngày đi làm", unit: "%" },
  { key: "CASH_SHORT_MAX", label: "Thiếu tiền khi chốt ca (mỗi ca) không quá", unit: "đ" },
  { key: "OWNER_REVIEW", label: "Chủ quán đánh giá Đạt", unit: "" },
] as const;

export type ConditionType = (typeof CONDITION_TYPES)[number]["key"];
export const isConditionType = (k: string): k is ConditionType => CONDITION_TYPES.some((c) => c.key === k);

export type Condition = { type: ConditionType; metric?: MetricKey; value: number };

export type BonusPart = {
  name: string;
  amount: number;
  /** Chỉ tính khi đã đạt phần đầu tiên (điều kiện nền — chặn chạy doanh số bằng giảm giá) */
  requiresFirst?: boolean;
  conditions: Condition[];
};

/**
 * Mặc định khi chưa cấu hình (sửa ở /kpi/bonus). Cộng dồn: 500k → 700k → 1 triệu, trần tổng 1 triệu.
 * Bài toán: chỉ tiêu gợi ý = TB 3 tháng × 105% nên tiền thưởng trả cho phần làm thêm; phần 2–3 cần đạt phần 1 (có
 * chốt chặn lãi gộp ≥ 90%) nên không chạy doanh số bằng cách giảm giá / tặng quà quá tay; phần 3 kéo phụ kiện (biên lãi
 * cao) qua bán kèm, và tính cả việc được giao (checklist, tiền ca, đánh giá của chủ quán).
 */
export const DEFAULT_PARTS: BonusPart[] = [
  {
    name: "Đạt chỉ tiêu cơ bản",
    amount: 500_000,
    conditions: [
      { type: "COMPLETION_PCT", value: 100 },
      { type: "METRIC_PCT", metric: "GROSS_PROFIT", value: 90 },
    ],
  },
  {
    name: "Đạt chỉ tiêu điện thoại và phụ kiện",
    amount: 200_000,
    requiresFirst: true,
    conditions: [
      { type: "METRIC_PCT", metric: "PHONE_COUNT", value: 100 },
      { type: "METRIC_PCT", metric: "ACCESSORY_REVENUE", value: 100 },
    ],
  },
  {
    name: "Vượt doanh số, bán kèm, hoàn thành tốt công việc",
    amount: 300_000,
    requiresFirst: true,
    conditions: [
      { type: "COMPLETION_PCT", value: 120 },
      { type: "ATTACH_RATE", value: 50 },
      { type: "CHECKLIST_RATE", value: 90 },
      { type: "CASH_SHORT_MAX", value: 100_000 },
      { type: "OWNER_REVIEW", value: 0 },
    ],
  },
];

export const DEFAULT_MAX_TOTAL = 1_000_000;

/**
 * Chỉ tiêu mà cấu hình thưởng cần (điều kiện "Một chỉ tiêu đạt % mục tiêu"): nhân viên không có chỉ tiêu này thì phần
 * thưởng đó không bao giờ đạt — và phần sau "cần đạt phần 1" cũng mất theo. Dùng để cảnh báo khi đặt chỉ tiêu.
 */
export function requiredMetrics(config: Pick<BonusConfig, "partsEnabled" | "parts">) {
  const out = new Map<MetricKey, string[]>();
  if (!config.partsEnabled) return out;
  for (const p of config.parts)
    for (const c of p.conditions)
      if (c.type === "METRIC_PCT" && c.metric) out.set(c.metric, [...(out.get(c.metric) ?? []), p.name]);
  return out;
}

/** Đọc danh sách phần thưởng từ JSON trong DB (bỏ qua dữ liệu sai thay vì lỗi trang) */
export function parseParts(json: unknown): BonusPart[] | null {
  if (!Array.isArray(json)) return null;
  const parts: BonusPart[] = [];
  for (const p of json) {
    const amount = Number(p?.amount);
    if (typeof p?.name !== "string" || !Number.isFinite(amount) || !Array.isArray(p?.conditions)) continue;
    const conditions: Condition[] = [];
    for (const c of p.conditions) {
      const value = Number(c?.value ?? 0);
      if (!isConditionType(String(c?.type)) || !Number.isFinite(value)) continue;
      if (c.type === "METRIC_PCT" && !isMetric(String(c.metric))) continue;
      conditions.push({ type: c.type, ...(c.type === "METRIC_PCT" && { metric: c.metric }), value });
    }
    parts.push({ name: p.name, amount, requiresFirst: !!p.requiresFirst, conditions });
  }
  return parts;
}

/** Số liệu ngoài giao dịch dùng cho điều kiện thưởng */
export type PerfFacts = {
  /** Checklist: số việc đã làm / số việc phải làm trong các ngày nhân viên đi làm (theo chi nhánh của ca) */
  checklistDone: number;
  checklistTotal: number;
  /** Thiếu tiền nhiều nhất ở một ca đã chốt (0 = không ca nào thiếu) */
  maxCashShort: number;
  closedShifts: number;
  review: { passed: boolean; note: string | null; reviewedBy: string } | null;
};

export const EMPTY_FACTS: PerfFacts = { checklistDone: 0, checklistTotal: 0, maxCashShort: 0, closedShifts: 0, review: null };

const pctText = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const vnd = (n: number) => `${n.toLocaleString("vi-VN")} đ`;
/** So sánh % làm tròn 0,01 để 99,999…% do chia số không bị trượt mốc 100% */
const reach = (ratio: number, pct: number) => Math.round(ratio * 10_000) / 100 >= pct;

export type ConditionResult = { met: boolean; text: string };

/** Một điều kiện của phần thưởng: đạt chưa + mô tả kèm số hiện tại để nhân viên biết còn thiếu gì */
export function checkCondition(
  c: Condition,
  ctx: { rows: MetricRow[]; actuals: Actuals; completion: number | null; facts: PerfFacts },
): ConditionResult {
  const { rows, actuals, completion, facts } = ctx;
  switch (c.type) {
    case "COMPLETION_PCT":
      return completion == null
        ? { met: false, text: `KPI chung ≥ ${c.value}% — chưa có chỉ tiêu` }
        : { met: reach(completion, c.value), text: `KPI chung ${pctText(completion * 100)} (cần ≥ ${c.value}%)` };
    case "METRIC_PCT": {
      const info = metricInfo(c.metric ?? "");
      const row = rows.find((r) => r.metric === c.metric);
      if (!row) return { met: false, text: `${info?.label ?? c.metric} ≥ ${c.value}% — chưa đặt chỉ tiêu này` };
      return { met: reach(row.ratio, c.value), text: `${row.label} ${pctText(row.ratio * 100)} (cần ≥ ${c.value}%)` };
    }
    case "REVENUE_PCT": {
      const revenueRows = rows.filter((r) => REVENUE_METRICS.includes(r.metric));
      const target = revenueRows.reduce((s, r) => s + r.target, 0);
      if (!target) return { met: false, text: `Doanh thu ≥ ${c.value}% chỉ tiêu — chưa đặt chỉ tiêu doanh thu` };
      return { met: reach(actuals.revenue / target, c.value), text: `Doanh thu ${pctText((actuals.revenue / target) * 100)} (cần ≥ ${c.value}%)` };
    }
    case "ATTACH_RATE": {
      if (!actuals.PHONE_COUNT) return { met: false, text: `Bán kèm ≥ ${c.value}% — chưa bán máy nào` };
      const rate = actuals.attached / actuals.PHONE_COUNT;
      return {
        met: reach(rate, c.value),
        text: `Bán kèm ${actuals.attached}/${actuals.PHONE_COUNT} máy = ${pctText(rate * 100)} (cần ≥ ${c.value}%)`,
      };
    }
    case "CHECKLIST_RATE": {
      if (!facts.checklistTotal) return { met: true, text: "Checklist: không có việc nào phải làm" };
      const rate = facts.checklistDone / facts.checklistTotal;
      return {
        met: reach(rate, c.value),
        text: `Checklist ${facts.checklistDone}/${facts.checklistTotal} việc = ${pctText(rate * 100)} (cần ≥ ${c.value}%)`,
      };
    }
    case "CASH_SHORT_MAX":
      return {
        met: facts.maxCashShort <= c.value,
        text: facts.maxCashShort
          ? `Thiếu tiền ca nhiều nhất ${vnd(facts.maxCashShort)} (cho phép ≤ ${vnd(c.value)})`
          : `Không ca nào thiếu tiền (${facts.closedShifts} ca đã chốt)`,
      };
    case "OWNER_REVIEW":
      return !facts.review
        ? { met: false, text: "Chờ chủ quán đánh giá" }
        : facts.review.passed
          ? { met: true, text: "Chủ quán đánh giá: Đạt" }
          : { met: false, text: `Chủ quán đánh giá: Không đạt${facts.review.note ? ` — ${facts.review.note}` : ""}` };
  }
}

/**
 * Cách thưởng của một nhóm hàng — chọn MỘT để không thưởng hai lần trên cùng khoản doanh thu:
 * - COMMISSION (B): % doanh thu nhóm; nhiều bậc thì cả doanh thu nhóm hưởng tỉ lệ của bậc cao nhất đã đạt.
 * - PROFIT (C): % lãi gộp nhóm; còn đơn thiếu giá vốn thì không tính (không đoán lãi).
 */
export type GroupRule =
  | { mode: "NONE" }
  | { mode: "COMMISSION"; commission: { fromRevenue: number; ratePct: number }[] }
  | { mode: "PROFIT"; profitPct: number };

export type BonusConfig = {
  partsEnabled: boolean;
  parts: BonusPart[];
  /** Trần tổng thưởng / nhân viên / tháng (mọi khoản); null = không giới hạn */
  maxTotal: number | null;
  groups: Record<BonusGroup, GroupRule>;
  /** Chỉ tiêu bật sẵn + trọng số khi đặt KPI lần đầu trong tháng */
  targetWeights: Partial<Record<MetricKey, number>>;
  /** Chỉ tiêu gợi ý = TB 3 tháng × % này */
  targetGrowthPct: number;
};

const NONE: GroupRule = { mode: "NONE" };

/** Đọc cấu hình nhóm từ JSON trong DB (bỏ qua dữ liệu sai thay vì lỗi trang) */
export function parseGroups(json: unknown): Record<BonusGroup, GroupRule> {
  const src = (json && typeof json === "object" ? json : {}) as Record<string, Record<string, unknown> | undefined>;
  const out = { PHONE: NONE, ACCESSORY: NONE, REPAIR: NONE } as Record<BonusGroup, GroupRule>;
  for (const { key } of BONUS_GROUPS) {
    const r = src[key];
    if (r?.mode === "COMMISSION" && Array.isArray(r.commission)) {
      const commission = r.commission
        .map((c: { fromRevenue?: unknown; ratePct?: unknown }) => ({ fromRevenue: Number(c?.fromRevenue), ratePct: Number(c?.ratePct) }))
        .filter((c) => Number.isFinite(c.fromRevenue) && Number.isFinite(c.ratePct))
        .sort((x, y) => x.fromRevenue - y.fromRevenue);
      if (commission.length) out[key] = { mode: "COMMISSION", commission };
    } else if (r?.mode === "PROFIT" && Number.isFinite(Number(r.profitPct))) {
      out[key] = { mode: "PROFIT", profitPct: Number(r.profitPct) };
    }
  }
  return out;
}

export const DEFAULT_BONUS: BonusConfig = {
  partsEnabled: true,
  parts: DEFAULT_PARTS,
  maxTotal: DEFAULT_MAX_TOTAL,
  groups: parseGroups(null),
  targetWeights: DEFAULT_TARGET_WEIGHTS,
  targetGrowthPct: DEFAULT_TARGET_GROWTH_PCT,
};

/** Các điều kiện "làm tốt việc được giao" dùng chung cho phần 3 của các mẫu */
const DUTY_CONDITIONS: Condition[] = [
  { type: "CHECKLIST_RATE", value: 90 },
  { type: "CASH_SHORT_MAX", value: 100_000 },
  { type: "OWNER_REVIEW", value: 0 },
];

/** Ba phần 500k / 200k / 300k với ngưỡng tuỳ mẫu */
function threeParts(o: {
  base: number;
  profit: number;
  second: Condition[];
  top: number;
  attach: number;
}): BonusPart[] {
  return [
    {
      name: "Đạt chỉ tiêu cơ bản",
      amount: 500_000,
      conditions: [
        { type: "COMPLETION_PCT", value: o.base },
        { type: "METRIC_PCT", metric: "GROSS_PROFIT", value: o.profit },
      ],
    },
    { name: DEFAULT_PARTS[1].name, amount: 200_000, requiresFirst: true, conditions: o.second },
    {
      name: DEFAULT_PARTS[2].name,
      amount: 300_000,
      requiresFirst: true,
      conditions: [{ type: "COMPLETION_PCT", value: o.top }, { type: "ATTACH_RATE", value: o.attach }, ...DUTY_CONDITIONS],
    },
  ];
}

const phoneAndAccessory = (phone: number, accessory: number): Condition[] => [
  { type: "METRIC_PCT", metric: "PHONE_COUNT", value: phone },
  { type: "METRIC_PCT", metric: "ACCESSORY_REVENUE", value: accessory },
];

/**
 * Mẫu cấu hình tạo sẵn (lần đầu mở Cấu hình thưởng khi chưa có mẫu nào) — admin sửa / xoá / thêm ở /kpi/bonus.
 * Đều tối đa 1 triệu / tháng, B / C tắt (trừ "Đẩy phụ kiện" có hoa hồng phụ kiện nhỏ, vẫn nằm trong trần).
 */
export const KPI_TEMPLATE_PRESETS: ({ name: string; description: string } & BonusConfig)[] = [
  {
    name: "Quán mới mở (3 tháng đầu)",
    description:
      "Khách chưa nhiều: thưởng cho việc kiếm khách (số khách lưu SĐT ×2), ngưỡng thấp để nhân viên đạt được ngay tháng đầu; chỉ tiêu gợi ý tăng 10% / tháng.",
    ...DEFAULT_BONUS,
    parts: threeParts({ base: 90, profit: 80, second: phoneAndAccessory(100, 100), top: 110, attach: 30 }),
    targetWeights: { CUSTOMER_COUNT: 2, PHONE_COUNT: 2, ACCESSORY_REVENUE: 1, GROSS_PROFIT: 1, REPAIR_REVENUE: 1 },
    targetGrowthPct: 110,
  },
  {
    name: "Ổn định",
    description: "Quán đã chạy đều: chỉ tiêu = TB 3 tháng × 105%, thưởng 500k / 700k / 1 triệu.",
    ...DEFAULT_BONUS,
  },
  {
    name: "Mùa cao điểm (Tết, ra máy mới)",
    description: "Khách đông: chỉ tiêu cao hơn (TB × 120%), số máy ×3, phần 3 cần vượt 130% — thưởng giữ trần 1 triệu.",
    ...DEFAULT_BONUS,
    parts: threeParts({ base: 100, profit: 90, second: phoneAndAccessory(110, 100), top: 130, attach: 50 }),
    targetWeights: { PHONE_COUNT: 3, ACCESSORY_REVENUE: 1, GROSS_PROFIT: 1, REPAIR_REVENUE: 1 },
    targetGrowthPct: 120,
  },
  {
    name: "Mùa thấp điểm",
    description: "Khách ít (sau Tết, mùa mưa): chỉ tiêu = TB × 95%, ngưỡng phần 1 là 90% để giữ động lực.",
    ...DEFAULT_BONUS,
    parts: threeParts({ base: 90, profit: 90, second: phoneAndAccessory(90, 100), top: 110, attach: 50 }),
    targetGrowthPct: 95,
  },
  {
    name: "Đẩy phụ kiện & bán kèm",
    description: "Tập trung phụ kiện (biên lãi cao): phụ kiện ×2, phần 2 xét phụ kiện + bán kèm, thêm hoa hồng phụ kiện 3% (trong trần 1 triệu).",
    ...DEFAULT_BONUS,
    parts: threeParts({
      base: 100,
      profit: 90,
      second: [
        { type: "METRIC_PCT", metric: "ACCESSORY_REVENUE", value: 110 },
        { type: "ATTACH_RATE", value: 40 },
      ],
      top: 120,
      attach: 60,
    }),
    groups: { ...DEFAULT_BONUS.groups, ACCESSORY: { mode: "COMMISSION", commission: [{ fromRevenue: 0, ratePct: 3 }] } },
    targetWeights: { ACCESSORY_REVENUE: 2, PHONE_COUNT: 1, GROSS_PROFIT: 1, REPAIR_REVENUE: 1 },
  },
];

const fmtVND = (n: number) => `${n.toLocaleString("vi-VN")} đ`;

/** Tóm tắt một cấu hình thành vài dòng chữ (lịch sử cấu hình, thẻ mẫu) */
export function describeConfig(c: BonusConfig) {
  const lines: string[] = [];
  if (c.partsEnabled)
    for (const p of c.parts)
      lines.push(
        `${p.name} (${fmtVND(p.amount)}): ${p.conditions
          .map((x) => {
            const label = x.type === "METRIC_PCT" ? metricInfo(x.metric ?? "")?.label : CONDITION_TYPES.find((t) => t.key === x.type)?.label;
            return x.type === "OWNER_REVIEW" ? label : `${label} ${x.type === "CASH_SHORT_MAX" ? `≤ ${fmtVND(x.value)}` : `≥ ${x.value}%`}`;
          })
          .join(", ")}`,
      );
  for (const g of BONUS_GROUPS) {
    const r = c.groups[g.key];
    if (r.mode === "COMMISSION")
      lines.push(
        `${g.label}: hoa hồng ${r.commission
          .map((x) => (x.fromRevenue ? `từ ${fmtVND(x.fromRevenue)} ${pctText(x.ratePct)}` : pctText(x.ratePct)))
          .join(", ")}`,
      );
    else if (r.mode === "PROFIT") lines.push(`${g.label}: ${pctText(r.profitPct)} lãi gộp`);
  }
  if (c.maxTotal != null) lines.push(`Tối đa ${fmtVND(c.maxTotal)} / tháng`);
  const weights = Object.entries(c.targetWeights)
    .map(([k, w]) => `${metricInfo(k)?.label} ×${w}`)
    .join(", ");
  lines.push(`Chỉ tiêu: ${weights || "không bật sẵn"} · gợi ý TB 3 tháng × ${c.targetGrowthPct}%`);
  return lines;
}

export type PayoutLine = {
  key: string;
  label: string;
  amount: number;
  /** Cách tính, vd "1,5% doanh thu" (kèm `base` — ẩn khi là lãi gộp mà người xem không có quyền xem lãi) */
  rate: string;
  base?: number;
  /** Không tính được (thiếu giá vốn) */
  blocked?: string;
  profitBased?: boolean;
  /** Phần thưởng (A): từng điều kiện đạt / chưa */
  conditions?: ConditionResult[];
  /** Phần thưởng (A): đạt hay chưa (amount = 0 khi chưa) */
  met?: boolean;
};

/** Tổng thưởng dự kiến = các phần A đạt được + B / C từng nhóm hàng, không vượt trần `maxTotal` */
export function computePayout(
  ctx: { rows: MetricRow[]; actuals: Actuals; completion: number | null; facts: PerfFacts },
  config: BonusConfig,
) {
  const lines: PayoutLine[] = [];
  if (config.partsEnabled) {
    let firstMet = false;
    config.parts.forEach((part, i) => {
      const conditions = part.conditions.map((c) => checkCondition(c, ctx));
      const allMet = conditions.length > 0 && conditions.every((c) => c.met);
      const gated = i > 0 && part.requiresFirst && !firstMet;
      const met = allMet && !gated;
      if (i === 0) firstMet = allMet;
      lines.push({
        key: `PART_${i}`,
        label: part.name,
        amount: met ? part.amount : 0,
        rate: met
          ? "Đạt"
          : gated && allMet
            ? `Cần đạt "${config.parts[0].name}" trước`
            : `Chưa đạt ${conditions.filter((c) => !c.met).length}/${conditions.length} điều kiện`,
        conditions: gated && allMet ? [...conditions, { met: false, text: `Cần đạt "${config.parts[0].name}"` }] : conditions,
        met,
        base: undefined,
      });
    });
  }
  for (const { key, label } of BONUS_GROUPS) {
    const rule = config.groups[key];
    const g = ctx.actuals.groups[key];
    if (rule.mode === "COMMISSION") {
      let ratePct = 0;
      for (const c of rule.commission) if (g.revenue >= c.fromRevenue) ratePct = c.ratePct;
      lines.push({
        key: `COMMISSION_${key}`,
        label: `Hoa hồng ${label.toLowerCase()}`,
        amount: Math.round((g.revenue * ratePct) / 100),
        rate: ratePct ? `${pctText(ratePct)} doanh thu` : "Chưa đạt bậc doanh số",
        base: g.revenue,
      });
    } else if (rule.mode === "PROFIT") {
      const blocked = g.missingCost > 0 ? `Còn ${g.missingCost} đơn thiếu giá vốn — chưa tính` : undefined;
      lines.push({
        key: `PROFIT_${key}`,
        label: `Thưởng lợi nhuận ${label.toLowerCase()}`,
        amount: blocked ? 0 : Math.round((Math.max(0, g.profit) * rule.profitPct) / 100),
        rate: `${pctText(rule.profitPct)} lãi gộp`,
        base: g.profit,
        blocked,
        profitBased: true,
      });
    }
  }
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (config.maxTotal != null && sum > config.maxTotal)
    lines.push({ key: "CAP", label: "Vượt mức thưởng tối đa", amount: config.maxTotal - sum, rate: `Tối đa ${vnd(config.maxTotal)} / tháng` });
  const total = config.maxTotal != null ? Math.min(sum, config.maxTotal) : sum;
  const parts = lines.filter((l) => l.key.startsWith("PART_"));
  return { lines, total, partsMet: parts.filter((l) => l.met).length, partsCount: parts.length };
}

export function formatMetric(value: number, unit: string) {
  return `${value.toLocaleString("vi-VN")} ${unit}`;
}

export function formatPct(ratio: number | null) {
  return ratio == null ? "—" : `${(ratio * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

/** Màu theo % hoàn thành: đạt (≥ 100%) xanh, gần đạt (≥ 70%) vàng, còn lại đỏ */
export function pctTone(ratio: number | null) {
  if (ratio == null) return "text-slate-400";
  return ratio >= 1 ? "text-green-700" : ratio >= 0.7 ? "text-amber-600" : "text-red-600";
}
