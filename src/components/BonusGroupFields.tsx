"use client";

import { useState } from "react";
import type { GroupRule } from "@/lib/kpi-metrics";
import { MoneyInput } from "./MoneyInput";
import { Segmented } from "./TransactionFields";

/** Số bậc hoa hồng tối đa trong form — để trống dòng nào thì bỏ dòng đó */
const COMMISSION_ROWS = 4;

/**
 * Cách thưởng của một nhóm hàng ở trang Cấu hình thưởng: Không / Hoa hồng theo doanh thu (B) / Thưởng theo lãi gộp (C).
 * Chỉ chọn được một cách cho mỗi nhóm → không thưởng hai lần trên cùng khoản doanh thu.
 */
export function BonusGroupFields({ group, label, rule }: { group: string; label: string; rule: GroupRule }) {
  const [mode, setMode] = useState<GroupRule["mode"]>(rule.mode);
  const commission = rule.mode === "COMMISSION" ? rule.commission : [{ fromRevenue: 0, ratePct: 0 }];
  const rows = Array.from({ length: Math.max(COMMISSION_ROWS, commission.length) }, (_, i) => commission[i]);

  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{label}</legend>
      <input type="hidden" name={`mode_${group}`} value={mode} />
      <Segmented
        label={`Cách thưởng ${label}`}
        value={mode}
        onChange={setMode}
        options={[
          { value: "NONE", label: "Không" },
          { value: "COMMISSION", label: "Hoa hồng doanh thu" },
          { value: "PROFIT", label: "Theo lãi gộp" },
        ]}
      />
      {mode === "COMMISSION" && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-[1fr_7rem] gap-2 text-xs font-medium text-slate-500">
            <span>Doanh thu nhóm từ</span>
            <span>Hoa hồng (%)</span>
          </div>
          {rows.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem] items-center gap-2">
              <MoneyInput name={`commFrom_${group}`} defaultValue={c ? c.fromRevenue : null} placeholder={i === 0 ? "0" : ""} />
              <input
                name={`commRate_${group}`}
                type="number"
                min={0}
                max={100}
                step="any"
                defaultValue={c?.ratePct || ""}
                aria-label={`Bậc ${i + 1}: % hoa hồng`}
                className="input text-right tabular-nums"
              />
            </div>
          ))}
          <p className="text-xs text-slate-500">
            Một tỉ lệ cho mọi mức: chỉ điền dòng đầu (từ 0 đ). Nhiều bậc: cả doanh thu nhóm hưởng tỉ lệ của bậc cao nhất đã đạt.
          </p>
        </div>
      )}
      {mode === "PROFIT" && (
        <div className="mt-3">
          <label className="field max-w-48">
            <span>% lãi gộp nhóm</span>
            <input
              name={`profitPct_${group}`}
              type="number"
              min={0}
              max={100}
              step="any"
              required
              defaultValue={rule.mode === "PROFIT" ? rule.profitPct : ""}
              className="input text-right tabular-nums"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">Còn đơn thiếu giá vốn trong nhóm thì không tính khoản này cho đến khi nhập đủ.</p>
        </div>
      )}
    </fieldset>
  );
}
