"use client";

import { useState } from "react";
import { MoneyInput } from "./MoneyInput";

export type PriceSuggestion = { label: string; price: number; warrantyMonths?: number; productId?: number };

export function TransactionFields({
  shiftId,
  bankAccounts,
  saleSuggestions,
  repairSuggestions,
}: {
  shiftId: number;
  bankAccounts: string[];
  saleSuggestions: PriceSuggestion[];
  repairSuggestions: PriceSuggestion[];
}) {
  const [kind, setKind] = useState<"SALE" | "REPAIR">("SALE");
  const [payment, setPayment] = useState<"CASH" | "TRANSFER">("CASH");
  const [price, setPrice] = useState("");
  const [productId, setProductId] = useState("");
  const [warranty, setWarranty] = useState(0);
  const needCustomer = warranty > 0;
  const suggestions = kind === "REPAIR" ? repairSuggestions : saleSuggestions;
  const accountListId = `bank-accounts-${shiftId}`;
  const productListId = `products-${shiftId}-${kind}`;

  function onProductChange(name: string) {
    const match = suggestions.find((s) => s.label === name);
    // Chỉ giữ liên kết sản phẩm khi tên khớp đúng gợi ý (để đánh dấu máy có IMEI là đã bán)
    setProductId(kind === "SALE" && match?.productId ? String(match.productId) : "");
    if (match) {
      setPrice(String(match.price));
      if (match.warrantyMonths != null) setWarranty(match.warrantyMonths);
    }
  }

  return (
    <>
      <input type="hidden" name="shiftId" value={shiftId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="paymentMethod" value={payment} />
      <input type="hidden" name="productId" value={kind === "SALE" ? productId : ""} />

      <div className="col-span-full flex flex-wrap gap-3">
        <Segmented
          label="Loại"
          value={kind}
          onChange={setKind}
          options={[
            { value: "SALE", label: "Bán hàng" },
            { value: "REPAIR", label: "Sửa chữa" },
          ]}
        />
        <Segmented
          label="Thanh toán"
          value={payment}
          onChange={setPayment}
          options={[
            { value: "CASH", label: "Tiền mặt (TM)" },
            { value: "TRANSFER", label: "Chuyển khoản (CK)" },
          ]}
        />
      </div>

      <label className="field sm:col-span-2">
        <span>{kind === "REPAIR" ? "Nội dung sửa chữa *" : "Tên sản phẩm *"}</span>
        <input
          name="productName"
          required
          list={productListId}
          autoComplete="off"
          onChange={(e) => onProductChange(e.target.value)}
          className="input"
          placeholder={kind === "REPAIR" ? "Gõ để tìm trong bảng giá sửa chữa..." : "Gõ để tìm trong bảng giá..."}
        />
        <datalist id={productListId}>
          {suggestions.map((s) => (
            <option key={s.label} value={s.label}>
              {s.price.toLocaleString("vi-VN")} đ
            </option>
          ))}
        </datalist>
      </label>
      <label className="field">
        <span>Giá tiền *</span>
        <MoneyInput name="price" required value={price} onChange={setPrice} />
      </label>

      {payment === "TRANSFER" && (
        <label className="field">
          <span>Tài khoản nhận tiền *</span>
          <input
            name="bankAccount"
            required
            list={accountListId}
            className="input"
            placeholder="VD: VCB - 0123456789"
          />
          <datalist id={accountListId}>
            {bankAccounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
      )}

      <label className="field">
        <span>Bảo hành</span>
        <select
          name="warrantyMonths"
          value={warranty}
          onChange={(e) => setWarranty(Number(e.target.value))}
          className="input"
        >
          {Array.from({ length: 13 }, (_, m) => (
            <option key={m} value={m}>
              {m === 0 ? "Không bảo hành" : `${m} tháng`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Tên khách hàng{needCustomer && " *"}</span>
        <input name="customerName" required={needCustomer} className="input" />
      </label>
      <label className="field">
        <span>Số điện thoại{needCustomer && " *"}</span>
        <input name="customerPhone" type="tel" inputMode="tel" required={needCustomer} className="input" />
      </label>
      {needCustomer && (
        <p className="col-span-full -mt-1 text-xs text-amber-700">
          Có bảo hành: bắt buộc nhập tên và số điện thoại khách để tra cứu sau này.
        </p>
      )}
      <label className="field sm:col-span-2">
        <span>Ghi chú</span>
        <input name="note" className="input" />
      </label>
    </>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
