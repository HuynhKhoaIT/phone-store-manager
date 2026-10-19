import { KPI_METRICS, formatMetric, metricNote, type MetricKey } from "@/lib/kpi-metrics";
import { MoneyInput } from "@/components/MoneyInput";

export type RowValue = { target?: number; weight: number; active: boolean };

/**
 * Các dòng chỉ tiêu trong form (tick bật, mục tiêu, trọng số) — dùng chung cho đặt chỉ tiêu nhân viên và mẫu bộ chỉ tiêu.
 * Server đọc bằng parseTargetRows (actions.ts). `required`: chỉ tiêu cấu hình thưởng cần → nhãn "Bắt buộc".
 */
export function TargetRows({
  values,
  hints,
  required,
}: {
  values: Partial<Record<MetricKey, RowValue>>;
  hints?: Partial<Record<MetricKey, number>> | null;
  required: Map<MetricKey, string[]>;
}) {
  return (
    <div className="space-y-2">
      {KPI_METRICS.map((m) => {
        const v = values[m.key];
        const hint = hints?.[m.key];
        const note = metricNote(m.key);
        const needed = required.get(m.key);
        return (
          <div
            key={m.key}
            className={`flex flex-wrap items-center gap-2 rounded-md border p-2 ${needed ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}
          >
            <label className="flex min-w-44 flex-1 flex-wrap items-center gap-2 text-sm font-medium">
              <input type="checkbox" name={`active_${m.key}`} defaultChecked={v?.active ?? false} className="size-4" />
              {m.label}
              {needed && (
                <span className="badge bg-amber-100 text-amber-800" title={`Cấu hình thưởng cần: ${needed.join(", ")}`}>
                  Bắt buộc
                </span>
              )}
            </label>
            <label className="flex w-48 items-center gap-1" aria-label={`Mục tiêu ${m.label}`}>
              {m.money ? (
                <MoneyInput name={`target_${m.key}`} defaultValue={v?.target} placeholder="Mục tiêu" />
              ) : (
                <>
                  <input
                    name={`target_${m.key}`}
                    type="number"
                    min={1}
                    defaultValue={v?.target ?? ""}
                    placeholder="Mục tiêu"
                    className="input text-right tabular-nums"
                  />
                  <span className="w-10 shrink-0 text-sm text-slate-400">{m.unit}</span>
                </>
              )}
            </label>
            <label className="flex items-center gap-1 text-sm text-slate-500">
              ×
              <input
                name={`weight_${m.key}`}
                type="number"
                min={1}
                max={10}
                defaultValue={v?.weight ?? 1}
                aria-label={`Trọng số ${m.label}`}
                className="input w-14 text-center tabular-nums"
              />
            </label>
            {(hint != null || note || needed) && (
              <p className="w-full pl-6 text-xs text-slate-500">
                {[
                  hint != null && `Gợi ý: ${formatMetric(hint, m.unit)}`,
                  needed && `Cấu hình thưởng cần (${needed.join(", ")})`,
                  note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
