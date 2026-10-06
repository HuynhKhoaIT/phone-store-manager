import { addDays, addMonths, daysInMonth, formatDate, formatMonth, isValidDate, isValidMonth } from "./format";

/** Khoảng ngày dài nhất cho phép (tránh tải quá nhiều dữ liệu một lần) */
export const MAX_RANGE_DAYS = 366;

export type Period = {
  mode: "month" | "range";
  /** Tháng đang xem (theo tháng) hoặc tháng của ngày cuối (khoảng ngày) — dùng cho cụm ‹ tháng › */
  month: string;
  from: string;
  to: string;
  days: number;
  /** "Tháng 10/2026" hoặc "01/10/2026 – 15/10/2026" */
  label: string;
  /** Kỳ trước để so sánh: tháng trước, hoặc cùng số ngày liền trước khoảng đang xem */
  prev: { from: string; to: string };
  prevLabel: string;
};

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function monthRange(month: string) {
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}` };
}

/**
 * Khoảng thời gian của Dashboard / Báo cáo từ query: `?from=&to=` (từ ngày đến ngày) ưu tiên hơn `?month=`.
 * Ngày lưu dạng chuỗi YYYY-MM-DD nên lọc bằng `{ gte: from, lte: to }`.
 */
export function getPeriod(sp: { month?: string; from?: string; to?: string }, today: string): Period {
  if (sp.from && sp.to && isValidDate(sp.from) && isValidDate(sp.to)) {
    let [from, to] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    if (daysBetween(from, to) > MAX_RANGE_DAYS) to = addDays(from, MAX_RANGE_DAYS - 1);
    const days = daysBetween(from, to);
    return {
      mode: "range",
      month: to.slice(0, 7),
      from,
      to,
      days,
      label: from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`,
      prev: { from: addDays(from, -days), to: addDays(from, -1) },
      prevLabel: `so với ${days} ngày trước đó`,
    };
  }
  const month = sp.month && isValidMonth(sp.month) ? sp.month : today.slice(0, 7);
  const { from, to } = monthRange(month);
  return {
    mode: "month",
    month,
    from,
    to,
    days: daysBetween(from, to),
    label: formatMonth(month),
    prev: monthRange(addMonths(month, -1)),
    prevLabel: "so với tháng trước",
  };
}

/** Tham số URL giữ nguyên khoảng thời gian đang xem (cho link, form, phân trang). */
export function periodParams(p: Period): Record<string, string> {
  return p.mode === "range" ? { from: p.from, to: p.to } : { month: p.month };
}

export const inPeriod = (date: string, r: { from: string; to: string }) => date >= r.from && date <= r.to;

/** Các ngày từ `from` đến `to` (dùng cho biểu đồ theo ngày) */
export function eachDay(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
