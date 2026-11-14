"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { MoneyInput } from "./MoneyInput";

/** `single` = máy có IMEI (luôn SL 1) */
export type ReceiptProductOption = { id: number; label: string; single?: boolean };

type Line = { key: number; text: string; qty: string; cost: string };

const formatVND = (n: number) => `${n.toLocaleString("vi-VN")} đ`;

/**
 * Các dòng hàng của một phiếu nhập / chuyển: chọn sản phẩm (gõ để tìm trong hàng hoá), số lượng, giá nhập / cái.
 * Mỗi dòng gửi `productName`, `productId`, `quantity`, `unitCost` cùng thứ tự (server đọc bằng getAll; bỏ dòng trống tên).
 */
export function ReceiptLines({ options, withCost }: { options: ReceiptProductOption[]; withCost: boolean }) {
  const listId = useId();
  const [lines, setLines] = useState<Line[]>([{ key: 0, text: "", qty: "1", cost: "" }]);
  const [nextKey, setNextKey] = useState(1);

  const update = (key: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => {
    setLines((ls) => [...ls, { key: nextKey, text: "", qty: "1", cost: "" }]);
    setNextKey((k) => k + 1);
  };

  const rows = lines.map((l) => {
    const match = options.find((o) => o.label === l.text);
    const qty = match?.single ? 1 : Math.max(0, Math.floor(Number(l.qty)) || 0);
    return { ...l, match, qty, amount: qty * (Number(l.cost) || 0) };
  });
  const filled = rows.filter((r) => r.text.trim());
  const totalQty = filled.reduce((s, r) => s + r.qty, 0);
  const total = filled.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="col-span-full space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">Hàng trong phiếu *</span>
        <span className="text-xs text-slate-500">Gõ tên hoặc mã để tìm trong hàng hoá</span>
      </div>
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>

      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-md border border-slate-200 p-2 sm:border-0 sm:p-0">
            <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
              <span className="hidden w-5 pt-2 text-right text-xs text-slate-400 tabular-nums sm:block">{i + 1}</span>
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <input
                  name="productName"
                  list={listId}
                  required={i === 0}
                  autoComplete="off"
                  value={r.text}
                  onChange={(e) => update(r.key, { text: e.target.value })}
                  className="input"
                  placeholder="Sản phẩm"
                  aria-label={`Sản phẩm dòng ${i + 1}`}
                />
                <input type="hidden" name="productId" value={r.match?.id ?? ""} />
                {r.text && !r.match && (
                  <small className="text-amber-700">Không có trong hàng hoá — lưu theo tên đã gõ (không cộng tồn kho).</small>
                )}
              </div>
              <input
                name="quantity"
                type="number"
                min={1}
                value={r.match?.single ? "1" : r.qty}
                readOnly={r.match?.single}
                title={r.match?.single ? "Máy có IMEI: 1 máy" : undefined}
                onChange={(e) => update(r.key, { qty: e.target.value })}
                className="input w-20 text-right tabular-nums read-only:bg-slate-50"
                aria-label={`Số lượng dòng ${i + 1}`}
              />
              {withCost && (
                <div className="w-36 flex-1 sm:flex-none">
                  <MoneyInput
                    name="unitCost"
                    value={r.cost}
                    onChange={(cost) => update(r.key, { cost })}
                    placeholder="Giá nhập / cái"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((l) => l.key !== r.key))}
                disabled={lines.length === 1}
                className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:invisible"
                aria-label={`Xoá dòng ${i + 1}`}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            {withCost && r.qty > 1 && r.amount > 0 && (
              <p className="mt-1 text-right text-xs text-slate-500 tabular-nums sm:pr-10">= {formatVND(r.amount)}</p>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <button type="button" onClick={addLine} className="btn-secondary">
          <Plus size={16} aria-hidden /> Thêm dòng
        </button>
        <p className="text-sm text-slate-600">
          {filled.length} dòng · {totalQty} sản phẩm
          {withCost && (
            <>
              {" "}
              · Tổng <b className="text-slate-900 tabular-nums">{formatVND(total)}</b>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
