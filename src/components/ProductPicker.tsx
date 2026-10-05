"use client";

import { useId, useState } from "react";

export type ProductOption = { id: number; label: string };

/**
 * Ô chọn sản phẩm từ danh sách hàng hoá (gõ để tìm).
 * Gửi `productName` (chữ đã chọn/gõ) và `productId` (khi khớp đúng một sản phẩm trong danh sách).
 */
export function ProductPicker({ options, required }: { options: ProductOption[]; required?: boolean }) {
  const listId = useId();
  const [text, setText] = useState("");
  const match = options.find((o) => o.label === text);

  return (
    <>
      <input
        name="productName"
        required={required}
        list={listId}
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="input"
        placeholder="Gõ tên hoặc mã để tìm trong hàng hoá..."
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>
      <input type="hidden" name="productId" value={match?.id ?? ""} />
      {text && !match && (
        <small className="text-amber-700">Không có trong danh sách hàng hoá — sẽ lưu theo tên đã gõ.</small>
      )}
    </>
  );
}
