"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const PANEL_WIDTH = 280;

const pad = (n: number) => String(n).padStart(2, "0");
const todayVN = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
/** "2026-10-05" → "05/10/2026" */
const display = (v: string) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : "");

/**
 * Chọn ngày tự làm (lịch tiếng Việt, tuần bắt đầu thứ Hai): <input type="date"> của trình duyệt hiện theo
 * ngôn ngữ trình duyệt (thường kiểu Mỹ tháng/ngày) và không đổi được bằng lang="vi".
 * - Có `name`: gửi giá trị YYYY-MM-DD qua input ẩn (dùng trong <form>).
 * - Có `onSelect`: gọi khi chọn (vd chuyển trang).
 */
export function DatePicker({
  value: initial = "",
  name,
  onSelect,
  label,
  placeholder = "Chọn ngày",
  required,
  clearable,
}: {
  value?: string;
  name?: string;
  onSelect?: (date: string) => void;
  label: string;
  placeholder?: string;
  required?: boolean;
  /** Có nút "Xoá" để bỏ chọn ngày (vd ngày kết thúc để trống = không thời hạn) */
  clearable?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState((initial || todayVN()).slice(0, 7));
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const today = todayVN();

  // Giá trị từ server đổi (chuyển trang) thì cập nhật theo
  useEffect(() => setValue(initial), [initial]);

  // Đóng khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const [y, m] = view.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // số ô trống trước ngày 1 (tuần bắt đầu thứ Hai)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${view}-${pad(i + 1)}`)];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setView(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const pick = (d: string) => {
    setValue(d);
    setOpen(false);
    if (d !== initial) onSelect?.(d);
  };

  return (
    <div ref={ref} className="relative">
      {name && <input type="hidden" name={name} value={value} required={required} />}
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          setView((value || today).slice(0, 7));
          setAlignRight(e.currentTarget.getBoundingClientRect().left + PANEL_WIDTH > window.innerWidth - 8);
          setOpen(!open);
        }}
        className="input flex w-auto items-center gap-2 tabular-nums"
      >
        <span className={value ? "" : "text-slate-400"}>{value ? display(value) : placeholder}</span>
        <CalendarDays size={16} className="text-slate-400" aria-hidden />
      </button>
      {open && (
        <div
          style={{ width: PANEL_WIDTH }}
          className={`absolute ${alignRight ? "right-0" : "left-0"} z-50 mt-1 rounded-lg bg-white p-3 shadow-[0_6px_16px_rgba(0,0,0,0.08),0_3px_6px_-4px_rgba(0,0,0,0.12),0_9px_28px_8px_rgba(0,0,0,0.05)]`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label="Tháng trước"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <span className="font-semibold tabular-nums">
              Tháng {m}/{y}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Tháng sau"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-slate-500">
            {WEEK.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) =>
              d ? (
                <button
                  key={d}
                  type="button"
                  onClick={() => pick(d)}
                  aria-label={display(d)}
                  aria-current={d === value ? "date" : undefined}
                  className={`h-8 rounded-md text-sm tabular-nums ${
                    d === value
                      ? "bg-[#1677ff] font-medium text-white"
                      : d === today
                        ? "text-[#1677ff] ring-1 ring-[#1677ff] hover:bg-blue-50"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {Number(d.slice(8))}
                </button>
              ) : (
                <span key={`e${i}`} />
              ),
            )}
          </div>
          <div className="mt-2 flex justify-end gap-4 border-t border-slate-100 pt-2">
            {clearable && value && (
              <button
                type="button"
                onClick={() => {
                  setValue("");
                  setOpen(false);
                }}
                className="text-sm text-slate-500 hover:underline"
              >
                Xoá
              </button>
            )}
            <button type="button" onClick={() => pick(today)} className="text-sm text-[#1677ff] hover:underline">
              Hôm nay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
