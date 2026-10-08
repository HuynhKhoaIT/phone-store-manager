"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { MoneyInput } from "./MoneyInput";
import { parseWarrantyMonths } from "@/lib/format";

export type RepairVariantRow = {
  id?: number;
  variant: string | null;
  price: number;
  /** Giá nhập linh kiện — form này chỉ admin dùng */
  costPrice: number | null;
  warranty: string | null;
  note: string | null;
};

/** Loại linh kiện hay gặp theo dịch vụ — gợi ý khi nhập, vẫn gõ tên khác được */
const VARIANT_HINTS: [RegExp, string[]][] = [
  [/màn|man hinh/i, ["Zin bóc máy", "Zin ép kính", "OLED", "Incell", "Linh kiện loại 1"]],
  [/pin/i, ["Pin zin", "Pin dung lượng cao", "Pin Pisen", "Pin EU"]],
  [/kính|kinh/i, ["Kính zin", "Kính thường"]],
  [/camera/i, ["Zin bóc máy", "Linh kiện"]],
  [/lưng|lung/i, ["Zin", "Linh kiện"]],
];
const DEFAULT_HINTS = ["Zin", "Linh kiện", "Loại 1", "Loại 2"];
const EMPTY_ROW: RepairVariantRow = { variant: null, price: 0, costPrice: null, warranty: null, note: null };

/**
 * Form một nhóm giá sửa chữa: dịch vụ × dòng máy + nhiều loại linh kiện (mỗi loại giá + bảo hành riêng).
 * Thêm mới thì "Dòng máy" nhập được nhiều máy cách nhau dấu phẩy.
 */
export function RepairPriceFields({
  services,
  service: initialService = "",
  device,
  rows: initialRows,
  editing = false,
}: {
  services: string[];
  service?: string;
  device?: string;
  rows?: RepairVariantRow[];
  editing?: boolean;
}) {
  const [service, setService] = useState(initialService);
  const [rows, setRows] = useState(() =>
    (initialRows?.length ? initialRows : [EMPTY_ROW]).map((r, i) => ({
      ...r,
      key: i,
    })),
  );
  const hints = VARIANT_HINTS.find(([re]) => re.test(service))?.[1] ?? DEFAULT_HINTS;
  const many = rows.length > 1;

  return (
    <>
      <label className="field">
        <span>Dịch vụ *</span>
        <input
          name="service"
          required
          list="repair-services"
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="input"
          placeholder="VD: Thay màn hình"
        />
        <datalist id="repair-services">
          {services.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>Dòng máy *</span>
        <input
          name="device"
          required
          defaultValue={device}
          className="input"
          placeholder={editing ? "VD: iPhone 8 Plus" : "VD: iPhone 8 Plus, iPhone 7 Plus"}
        />
        {!editing && <small className="text-slate-500">Nhiều máy cùng bảng giá: cách nhau dấu phẩy.</small>}
      </label>

      <fieldset className="col-span-full space-y-3">
        <legend className="mb-2 text-sm font-medium text-slate-700">Loại linh kiện & giá</legend>
        <datalist id="repair-variants">
          {hints.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
        {/* Mỗi loại một khung riêng có nhãn từng ô — nhiều loại không bị lẫn vào nhau */}
        {rows.map((r, idx) => (
          <div key={r.key} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">{many ? `Loại ${idx + 1}` : "Giá"}</p>
              {many && (
                <button
                  type="button"
                  onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-white hover:text-red-600"
                >
                  <X size={14} aria-hidden /> Bỏ loại này
                </button>
              )}
            </div>
            <input type="hidden" name="variantId" value={r.id ?? ""} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="field col-span-2">
                <span>Loại linh kiện{many && " *"}</span>
                <input
                  name="variant"
                  defaultValue={r.variant ?? ""}
                  required={many}
                  list="repair-variants"
                  placeholder={many ? "VD: Zin, OLED, Incell" : "Không bắt buộc"}
                  className="input"
                />
              </label>
              <label className="field">
                <span>Giá nhập</span>
                <MoneyInput name="costPrice" defaultValue={r.costPrice} />
              </label>
              <label className="field">
                <span>Giá sửa</span>
                <MoneyInput name="price" defaultValue={r.price || undefined} placeholder="Trống = Liên hệ" />
              </label>
              <label className="field">
                <span>Bảo hành</span>
                <select name="warranty" defaultValue={parseWarrantyMonths(r.warranty) ?? 0} className="input">
                  {Array.from({ length: 13 }, (_, m) => (
                    <option key={m} value={m}>
                      {m === 0 ? "Không bảo hành" : `${m} tháng`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field sm:col-span-3">
                <span>Ghi chú</span>
                <input name="note" defaultValue={r.note ?? ""} className="input" />
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { ...EMPTY_ROW, key: Date.now() }])}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1677ff] hover:underline"
        >
          <Plus size={16} aria-hidden /> Thêm loại linh kiện
        </button>
        <p className="text-xs text-slate-500">
          Giá nhập linh kiện chỉ admin thấy, dùng để tính lãi sửa chữa. Lúc bán, chọn loại sẽ tự điền giá và số tháng
          bảo hành.
        </p>
      </fieldset>
    </>
  );
}
