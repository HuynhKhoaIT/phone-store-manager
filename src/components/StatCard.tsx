import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

/**
 * Ô số liệu dùng chung (Dashboard, Báo cáo...) để các trang cùng một kiểu.
 * - `profit`: tô xanh khi ≥ 0, đỏ khi âm (lãi / lỗ).
 * - `change`: % so với tháng trước; `inverse` khi tăng là xấu (chi phí).
 */
export function StatCard({
  label,
  value,
  amount,
  profit,
  change,
  inverse,
  sub,
}: {
  label: string;
  value: string;
  /** Số gốc để tô màu khi `profit` */
  amount?: number;
  profit?: boolean;
  change?: number | null;
  inverse?: boolean;
  sub?: ReactNode;
}) {
  const color = profit && amount != null ? (amount >= 0 ? "text-green-700" : "text-red-600") : "text-slate-900";
  const good = change != null && (inverse ? change <= 0 : change >= 0);
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {change != null && (
        <p className="mt-0.5 text-xs text-slate-500">
          <span className={`inline-flex items-center gap-0.5 ${good ? "text-green-700" : "text-red-600"}`}>
            {change >= 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
            {change >= 0 ? "+" : ""}
            {change.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
          </span>{" "}
          so với tháng trước
        </p>
      )}
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
