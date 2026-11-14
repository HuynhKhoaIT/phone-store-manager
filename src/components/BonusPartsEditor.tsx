"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { CONDITION_TYPES, DEFAULT_PARTS, KPI_METRICS, type BonusPart, type ConditionType } from "@/lib/kpi-metrics";
import { MoneyInput } from "./MoneyInput";

const MAX_PARTS = 6;

/**
 * Soạn các phần thưởng (phương án A): mỗi phần = tên + tiền + danh sách điều kiện phải đạt hết; các phần đạt được
 * cộng dồn. Gửi lên server dạng JSON trong input ẩn `parts` (server kiểm tra lại toàn bộ).
 */
export function BonusPartsEditor({ initial }: { initial: BonusPart[] }) {
  const [parts, setParts] = useState<BonusPart[]>(initial);
  const total = parts.reduce((s, p) => s + (p.amount || 0), 0);
  const update = (i: number, patch: Partial<BonusPart>) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-3">
      <input type="hidden" name="parts" value={JSON.stringify(parts)} />
      {parts.map((part, i) => (
        <fieldset key={i} className="space-y-2 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Phần {i + 1}</legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={part.name}
              onChange={(e) => update(i, { name: e.target.value })}
              aria-label={`Tên phần ${i + 1}`}
              placeholder="Tên phần thưởng"
              className="input min-w-48 flex-1"
            />
            <div className="w-40">
              <MoneyInput
                name={`partAmount_${i}`}
                value={part.amount ? String(part.amount) : ""}
                onChange={(v) => update(i, { amount: Number(v || 0) })}
              />
            </div>
            <button
              type="button"
              onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}
              aria-label={`Xoá phần ${i + 1}`}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
          {i > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={!!part.requiresFirst}
                onChange={(e) => update(i, { requiresFirst: e.target.checked })}
                className="size-4"
              />
              Chỉ tính khi đã đạt phần 1 (điều kiện nền)
            </label>
          )}
          <p className="text-xs font-medium text-slate-500">Điều kiện (phải đạt tất cả)</p>
          {part.conditions.map((c, k) => {
            const info = CONDITION_TYPES.find((t) => t.key === c.type)!;
            const setCond = (patch: Partial<BonusPart["conditions"][number]>) =>
              update(i, { conditions: part.conditions.map((x, m) => (m === k ? { ...x, ...patch } : x)) });
            return (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <select
                  value={c.type}
                  onChange={(e) => {
                    const type = e.target.value as ConditionType;
                    setCond({ type, metric: type === "METRIC_PCT" ? (c.metric ?? "PHONE_COUNT") : undefined, value: type === "CASH_SHORT_MAX" ? 100_000 : type === "OWNER_REVIEW" ? 0 : 100 });
                  }}
                  aria-label="Loại điều kiện"
                  className="input w-auto min-w-0 flex-1"
                >
                  {CONDITION_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {c.type === "METRIC_PCT" && (
                  <select
                    value={c.metric}
                    onChange={(e) => setCond({ metric: e.target.value as BonusPart["conditions"][number]["metric"] })}
                    aria-label="Chỉ tiêu"
                    className="input w-auto"
                  >
                    {KPI_METRICS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
                {c.type !== "OWNER_REVIEW" && (
                  <span className="flex items-center gap-1 text-sm text-slate-500">
                    {c.type === "CASH_SHORT_MAX" ? "≤" : "≥"}
                    {c.type === "CASH_SHORT_MAX" ? (
                      <span className="w-36">
                        <MoneyInput name={`cond_${i}_${k}`} value={String(c.value)} onChange={(v) => setCond({ value: Number(v || 0) })} />
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        step="any"
                        value={c.value}
                        onChange={(e) => setCond({ value: Number(e.target.value) })}
                        aria-label={`Giá trị: ${info.label}`}
                        className="input w-20 text-right tabular-nums"
                      />
                    )}
                    {info.unit === "%" && "%"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => update(i, { conditions: part.conditions.filter((_, m) => m !== k) })}
                  aria-label="Bỏ điều kiện"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => update(i, { conditions: [...part.conditions, { type: "COMPLETION_PCT", value: 100 }] })}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#1677ff] hover:underline"
          >
            <Plus size={16} aria-hidden /> Thêm điều kiện
          </button>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-3">
          {parts.length < MAX_PARTS && (
            <button
              type="button"
              onClick={() =>
                setParts((ps) => [...ps, { name: "", amount: 0, requiresFirst: true, conditions: [{ type: "COMPLETION_PCT", value: 100 }] }])
              }
              className="inline-flex items-center gap-1 text-sm font-medium text-[#1677ff] hover:underline"
            >
              <Plus size={16} aria-hidden /> Thêm phần thưởng
            </button>
          )}
          <button type="button" onClick={() => setParts(DEFAULT_PARTS)} className="text-sm text-slate-500 hover:underline">
            Dùng mặc định
          </button>
        </div>
        <span className="text-sm text-slate-600">
          Đạt hết các phần: <b className="tabular-nums">{total.toLocaleString("vi-VN")} đ</b>
        </span>
      </div>
    </div>
  );
}
