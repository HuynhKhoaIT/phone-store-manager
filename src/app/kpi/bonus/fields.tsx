import { BONUS_GROUPS, KPI_METRICS, type BonusConfig } from "@/lib/kpi-metrics";
import { BonusGroupFields } from "@/components/BonusGroupFields";
import { BonusPartsEditor } from "@/components/BonusPartsEditor";
import { MoneyInput } from "@/components/MoneyInput";

/**
 * Các ô của một cấu hình thưởng — dùng chung cho form cấu hình tháng và form mẫu cấu hình
 * (server action đọc bằng parseBonusForm trong actions.ts).
 */
export function BonusConfigFields({ config }: { config: BonusConfig }) {
  return (
    <>
      <div className="space-y-2">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" name="partsEnabled" defaultChecked={config.partsEnabled} className="size-4" />
          A — Thưởng theo phần (cộng dồn các phần đạt được)
        </label>
        <BonusPartsEditor initial={config.parts} />
      </div>

      <label className="field max-w-64">
        <span>Thưởng tối đa / nhân viên / tháng</span>
        <MoneyInput name="maxTotal" defaultValue={config.maxTotal} placeholder="Không giới hạn" />
        <small className="text-slate-500">Áp cho tổng mọi khoản (A + B + C). Để trống = không giới hạn.</small>
      </label>

      <div className="space-y-3">
        <div>
          <h3 className="font-medium">B / C — Theo nhóm hàng</h3>
          <p className="text-xs text-slate-500">
            Mỗi nhóm chọn <b>một</b> cách: hoa hồng theo doanh thu (B) hoặc % lãi gộp (C) — không thưởng hai lần cho cùng
            khoản. Đơn bán chưa phân loại điện thoại / phụ kiện không tính vào nhóm nào.
          </p>
        </div>
        {BONUS_GROUPS.map((g) => (
          <BonusGroupFields key={g.key} group={g.key} label={g.label} rule={config.groups[g.key]} />
        ))}
      </div>

      <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">Chỉ tiêu mặc định khi đặt KPI</legend>
        <p className="text-xs text-slate-500">
          Lần đầu đặt chỉ tiêu trong tháng, form bật sẵn các chỉ tiêu có trọng số &gt; 0 và điền gợi ý = TB 3 tháng trước × %
          bên dưới (lãi gộp giữ nguyên TB). 0 = không bật sẵn.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {KPI_METRICS.map((m) => (
            <label key={m.key} className="flex items-center justify-between gap-2 text-sm">
              <span>{m.label}</span>
              <span className="flex items-center gap-1 text-slate-500">
                ×
                <input
                  name={`tw_${m.key}`}
                  type="number"
                  min={0}
                  max={10}
                  defaultValue={config.targetWeights[m.key] ?? 0}
                  className="input w-16 text-center tabular-nums"
                />
              </span>
            </label>
          ))}
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Chỉ tiêu gợi ý = TB 3 tháng ×
          <input
            name="targetGrowthPct"
            type="number"
            min={50}
            max={300}
            defaultValue={config.targetGrowthPct}
            className="input w-20 text-right tabular-nums"
          />
          %
        </label>
      </fieldset>
    </>
  );
}
