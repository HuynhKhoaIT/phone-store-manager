"use client";

import { useId, useState } from "react";
import { MoneyInput } from "./MoneyInput";

export type ExchangeOption = { id: number; label: string; price: number };

/**
 * Các ô của form đổi bảo hành. Chọn máy đổi → tự tính tiền khách bù thêm = giá máy mới − giá máy cũ khách đã mua
 * (đổi ngang hoặc rẻ hơn thì 0 đ). Nhân viên vẫn sửa được số tiền.
 */
export function WarrantyExchangeFields({
  options,
  originalPrice,
  defaultWarranty,
  bankAccounts,
}: {
  options: ExchangeOption[];
  originalPrice: number;
  defaultWarranty: number;
  bankAccounts: string[];
}) {
  const listId = useId();
  const accountListId = useId();
  const [text, setText] = useState("");
  const [surcharge, setSurcharge] = useState("0");
  const [payment, setPayment] = useState<"CASH" | "TRANSFER">("CASH");
  const match = options.find((o) => o.label === text);
  const extra = Number(surcharge) || 0;

  function pick(value: string) {
    setText(value);
    const m = options.find((o) => o.label === value);
    if (m) setSurcharge(String(Math.max(0, m.price - originalPrice)));
  }

  return (
    <>
      <label className="field sm:col-span-2">
        <span>Máy / sản phẩm đổi cho khách *</span>
        <input
          name="productName"
          required
          list={listId}
          autoComplete="off"
          value={text}
          onChange={(e) => pick(e.target.value)}
          className="input"
          placeholder="Gõ tên hoặc mã để tìm trong hàng hoá..."
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.id} value={o.label} />
          ))}
        </datalist>
        <input type="hidden" name="productId" value={match?.id ?? ""} />
        {text && !match && <small className="text-amber-700">Phải chọn máy có trong danh sách hàng hoá.</small>}
        {match && (
          <small className="text-slate-500">
            Giá máy mới {match.price.toLocaleString("vi-VN")} đ − giá máy cũ {originalPrice.toLocaleString("vi-VN")} đ
          </small>
        )}
      </label>
      <label className="field">
        <span>Khách bù thêm (0 = đổi ngang)</span>
        <MoneyInput name="surcharge" value={surcharge} onChange={setSurcharge} />
      </label>
      <label className="field">
        <span>Bảo hành máy mới (tháng)</span>
        <input name="warrantyMonths" type="number" min={0} max={12} defaultValue={defaultWarranty} className="input" />
      </label>
      {extra > 0 && (
        <>
          <label className="field">
            <span>Hình thức thanh toán</span>
            <select
              name="paymentMethod"
              value={payment}
              onChange={(e) => setPayment(e.target.value === "TRANSFER" ? "TRANSFER" : "CASH")}
              className="input"
            >
              <option value="CASH">Tiền mặt</option>
              <option value="TRANSFER">Chuyển khoản</option>
            </select>
          </label>
          {payment === "TRANSFER" && (
            <label className="field">
              <span>Tài khoản nhận *</span>
              <input name="bankAccount" required list={accountListId} className="input" />
              <datalist id={accountListId}>
                {bankAccounts.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </label>
          )}
        </>
      )}
    </>
  );
}
