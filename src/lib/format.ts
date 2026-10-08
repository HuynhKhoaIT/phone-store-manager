const TZ = "Asia/Ho_Chi_Minh";

export function formatVND(n: number) {
  return `${n.toLocaleString("vi-VN")} đ`;
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function todayVN() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** Giờ hiện tại theo giờ Việt Nam, dạng HH:mm. */
export function nowTimeVN() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function isValidDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function isValidMonth(s: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const WEEKDAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

/** "Thứ 2, 05/10/2026" */
export function formatDateLong(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${formatDate(date)}`;
}

/** "05/10/2026" */
export function formatDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "Tháng 10/2026" */
export function formatMonth(month: string) {
  const [y, m] = month.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

export const KIND_LABEL: Record<string, string> = { SALE: "Bán hàng", REPAIR: "Sửa chữa", SIM: "SIM", TOPUP: "Nạp card" };
export const PAYMENT_LABEL: Record<string, string> = { CASH: "TM", TRANSFER: "CK" };

/** Giờ của một thời điểm theo giờ Việt Nam, dạng HH:mm. */
export function formatTimeVN(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** Ngày hết hạn bảo hành (YYYY-MM-DD) tính từ ngày bán. */
export function warrantyEnd(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  // 31/01 + 1 tháng → cuối tháng 2 thay vì tràn sang tháng 3
  if (end.getUTCDate() !== d) end.setUTCDate(0);
  return end.toISOString().slice(0, 10);
}

/** Ngày (YYYY-MM-DD) của một thời điểm theo giờ Việt Nam. */
export function dateVN(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** Thời điểm → "YYYY-MM-DDTHH:mm" theo giờ Việt Nam (cho ô datetime-local). */
export function dateTimeLocalVN(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}
