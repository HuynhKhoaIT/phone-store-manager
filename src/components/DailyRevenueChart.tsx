"use client";

import { useState } from "react";

export type DailyPoint = { date: string; sale: number; repair: number };

const fmt = (n: number) => `${n.toLocaleString("vi-VN")} đ`;

function shortMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** Bước trục Y "đẹp" (1, 2, 5 × 10^n) để có khoảng 4 vạch. */
function niceMax(max: number) {
  if (max <= 0) return { top: 1_000_000, step: 250_000 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step) * step, step };
}

export function DailyRevenueChart({ data }: { data: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.sale + d.repair));
  const { top, step } = niceMax(max);
  const labelStep = Math.max(5, Math.ceil(data.length / 8));
  const multiMonth = data.length > 0 && data[0].date.slice(0, 7) !== data[data.length - 1].date.slice(0, 7);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const h = (v: number) => `${(v / top) * 100}%`;
  const active = hover != null ? data[hover] : null;

  return (
    <figure>
      <div className="mb-5 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: "var(--series-sale)" }} /> Bán hàng
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: "var(--series-repair)" }} /> Sửa chữa
        </span>
      </div>

      <div className="relative flex h-64 gap-2">
        {/* Trục Y */}
        <div className="relative w-10 shrink-0 text-right text-[11px] text-slate-400 tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ bottom: h(t) }}>
              {shortMoney(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${t === 0 ? "border-slate-300" : "border-slate-100"}`}
              style={{ bottom: h(t) }}
            />
          ))}

          <div className="absolute inset-0 flex">
            {data.map((d, i) => {
              const total = d.sale + d.repair;
              return (
                <div
                  key={d.date}
                  className={`relative flex h-full flex-1 cursor-default flex-col-reverse items-center ${hover === i ? "bg-slate-100/70" : ""}`}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => setHover(i)}
                >
                  <div className="flex w-[70%] max-w-6 flex-col-reverse gap-[2px]" style={{ height: h(total) }}>
                    {d.sale > 0 && (
                      <div
                        className={d.repair > 0 ? "" : "rounded-t"}
                        style={{ flexGrow: d.sale, background: "var(--series-sale)" }}
                      />
                    )}
                    {d.repair > 0 && (
                      <div className="rounded-t" style={{ flexGrow: d.repair, background: "var(--series-repair)" }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {active && hover != null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-lg"
              style={{
                left: `${((hover + 0.5) / data.length) * 100}%`,
                transform: `translateX(${hover > data.length / 2 ? "calc(-100% - 12px)" : "12px"})`,
              }}
            >
              <p className="mb-1 font-semibold text-slate-800">
                Ngày {active.date.slice(8)}/{active.date.slice(5, 7)}
              </p>
              <Row color="var(--series-sale)" label="Bán hàng" value={fmt(active.sale)} />
              <Row color="var(--series-repair)" label="Sửa chữa" value={fmt(active.repair)} />
              <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-800">
                <span>Tổng</span>
                <span className="tabular-nums">{fmt(active.sale + active.repair)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trục X: tối đa ~8 nhãn (khoảng ngày dài thì giãn ra); qua nhiều tháng thì ghi ngày/tháng */}
      <div className="mt-1 flex gap-2">
        <div className="w-10 shrink-0" />
        <div className="flex flex-1 text-[11px] whitespace-nowrap text-slate-400">
          {data.map((d, i) => (
            <span key={d.date} className="flex-1 text-center">
              {i === 0 || (i + 1) % labelStep === 0
                ? multiMonth
                  ? `${d.date.slice(8)}/${d.date.slice(5, 7)}`
                  : Number(d.date.slice(8))
                : ""}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-500">Xem dạng bảng</summary>
        <div className="mt-2 max-h-72 overflow-y-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th className="text-right">Bán hàng</th>
                <th className="text-right">Sửa chữa</th>
                <th className="text-right">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((d) => d.sale + d.repair > 0)
                .map((d) => (
                  <tr key={d.date}>
                    <td data-title>
                      {d.date.slice(8)}/{d.date.slice(5, 7)}
                    </td>
                    <td data-label="Bán hàng" className="text-right tabular-nums">{fmt(d.sale)}</td>
                    <td data-label="Sửa chữa" className="text-right tabular-nums">{fmt(d.repair)}</td>
                    <td data-label="Tổng" className="text-right font-semibold tabular-nums">{fmt(d.sale + d.repair)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-slate-600">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
