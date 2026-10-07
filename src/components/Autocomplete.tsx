"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";

/** Bỏ dấu tiếng Việt + chữ thường để tìm "iphone 13" khớp "iPhone 13", "op lung" khớp "Ốp lưng". */
function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

const MAX_RESULTS = 50;

/**
 * Ô nhập có danh sách gợi ý tự viết (thay `<datalist>` — Safari iPhone hiện datalist rất kém).
 * Tìm theo từng từ, không phân biệt dấu / hoa thường, trên `label` + `keywords` (vd tên + mã / IMEI).
 * Vẫn cho gõ tự do: `onChange` nhận chữ đang gõ, `onSelect` khi chọn một gợi ý.
 */
export function Autocomplete<T>({
  name,
  value,
  onChange,
  onSelect,
  options,
  getLabel,
  getKeywords,
  renderMeta,
  required,
  placeholder,
  ariaLabel,
  className,
}: {
  name?: string;
  value: string;
  onChange: (text: string) => void;
  onSelect: (option: T) => void;
  options: T[];
  getLabel: (o: T) => string;
  getKeywords?: (o: T) => string;
  /** Thông tin phụ bên phải mỗi dòng (giá, số lượng...) */
  renderMeta?: (o: T) => ReactNode;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Class cho khung ngoài (vd `min-w-0 flex-1` khi đặt trong hàng flex) */
  className?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const indexed = useMemo(
    () => options.map((o) => ({ o, text: normalize(`${getLabel(o)} ${getKeywords?.(o) ?? ""}`) })),
    [options, getLabel, getKeywords],
  );
  const results = useMemo(() => {
    const words = normalize(value).split(/\s+/).filter(Boolean);
    const found = words.length ? indexed.filter((x) => words.every((w) => x.text.includes(w))) : indexed;
    return found.slice(0, MAX_RESULTS).map((x) => x.o);
  }, [indexed, value]);
  const show = open && results.length > 0;

  function choose(o: T) {
    onSelect(o);
    setOpen(false);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        className="input"
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && show && results[active]) {
            // Enter chọn gợi ý thay vì gửi form
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape" && show) {
            // Chỉ đóng gợi ý, không đóng popup
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {results.map((o, i) => (
            <li
              key={i}
              role="option"
              aria-selected={i === active}
              // mousedown: chọn trước khi ô nhập mất focus (onBlur đóng danh sách)
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-2 text-sm ${
                i === active ? "bg-[#e6f4ff]" : ""
              }`}
            >
              <span className="min-w-0 break-words">{getLabel(o)}</span>
              {renderMeta && <span className="shrink-0 text-xs text-slate-500 tabular-nums">{renderMeta(o)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
