"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { DatePicker } from "./DatePicker";

/** Ô chọn ngày / tháng, chọn xong thì chuyển trang. */
export function NavInput({
  type,
  value,
  hrefPrefix,
  hrefSuffix = "",
  label,
}: {
  type: "date" | "month";
  value: string;
  hrefPrefix: string;
  hrefSuffix?: string;
  label: string;
}) {
  const router = useRouter();
  const go = (v: string) => router.push(`${hrefPrefix}${v}${hrefSuffix}`);
  if (type === "month") return <MonthPicker value={value} onSelect={go} label={label} />;
  return <DatePicker value={value} onSelect={go} label={label} />;
}

const PANEL_WIDTH = 256;

/**
 * Chọn tháng tự làm: <input type="month"> của trình duyệt hiện tên tháng theo ngôn ngữ trình duyệt
 * (thường là tiếng Anh) và không đổi được bằng lang="vi".
 */
function MonthPicker({ value, onSelect, label }: { value: string; onSelect: (month: string) => void; label: string }) {
  const [y, m] = value.split("-").map(Number);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(y);
  // Nút nằm sát mép phải (vd trang Chấm công) thì mở bảng chọn về phía trái để không tràn màn hình
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()).slice(0, 7);
  const pick = (month: string) => {
    setOpen(false);
    if (month !== value) onSelect(month);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          setYear(y);
          setAlignRight(e.currentTarget.getBoundingClientRect().left + PANEL_WIDTH > window.innerWidth - 8);
          setOpen(!open);
        }}
        className="input flex w-auto items-center gap-2 tabular-nums"
      >
        Tháng {m}/{y}
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
              onClick={() => setYear(year - 1)}
              aria-label="Năm trước"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <span className="font-semibold tabular-nums">Năm {year}</span>
            <button
              type="button"
              onClick={() => setYear(year + 1)}
              aria-label="Năm sau"
              className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => {
              const month = `${year}-${String(i + 1).padStart(2, "0")}`;
              const selected = month === value;
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => pick(month)}
                  aria-label={`Tháng ${i + 1}/${year}`}
                  aria-current={selected ? "true" : undefined}
                  className={`h-9 rounded-md text-sm tabular-nums ${
                    selected
                      ? "bg-[#1677ff] font-medium text-white"
                      : month === now
                        ? "text-[#1677ff] ring-1 ring-[#1677ff] hover:bg-blue-50"
                        : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-2 border-t border-slate-100 pt-2 text-right">
            <button type="button" onClick={() => pick(now)} className="text-sm text-[#1677ff] hover:underline">
              Tháng này
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
