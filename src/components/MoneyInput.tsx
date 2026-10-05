"use client";

import { useState } from "react";

/**
 * Ô nhập tiền, tự thêm dấu chấm phân cách hàng nghìn.
 * Dùng `value`/`onChange` (chuỗi chữ số) nếu cần điều khiển từ bên ngoài.
 */
export function MoneyInput({
  name,
  defaultValue,
  value,
  onChange,
  placeholder = "0",
  required,
  id,
}: {
  name: string;
  defaultValue?: number | null;
  value?: string;
  onChange?: (digits: string) => void;
  placeholder?: string;
  required?: boolean;
  id?: string;
}) {
  const [inner, setInner] = useState(defaultValue != null ? String(defaultValue) : "");
  const digits = value ?? inner;
  const setDigits = onChange ?? setInner;

  return (
    <div className="relative">
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        required={required}
        placeholder={placeholder}
        value={digits ? Number(digits).toLocaleString("vi-VN") : ""}
        onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
        className="input pr-8 text-right tabular-nums"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
        đ
      </span>
      <input type="hidden" name={name} value={digits} />
    </div>
  );
}
