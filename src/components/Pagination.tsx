import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE, type Paging } from "@/lib/paging";

/**
 * Phân trang (xem `getPaging` trong src/lib/paging.ts).
 * - Máy tính: kiểu antd « 1 … 4 5 [6] 7 8 … 20 ».
 * - Điện thoại: nút "Xem thêm" tải thêm 20 dòng nối vào cuối, giữ vị trí cuộn.
 * Dùng link (server component), không cần JS. `href(page)` giữ nguyên bộ lọc hiện tại.
 */
export function Pagination({ paging, href }: { paging: Paging; href: (page: number) => string }) {
  const { page, pageCount, total, start } = paging;
  if (total === 0) return null;
  const shownOnMobile = Math.min(page * PAGE_SIZE, total);

  // Luôn hiện trang đầu, trang cuối và 1 trang mỗi bên trang hiện tại; chỗ trống thay bằng "…"
  const pages: (number | "gap")[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages.at(-1) !== "gap") pages.push("gap");
  }

  const base = "flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm tabular-nums";
  return (
    <>
      {/* Điện thoại */}
      <div className="space-y-2 sm:hidden">
        {page < pageCount && (
          <Link href={href(page + 1)} scroll={false} className="btn-secondary h-11 w-full text-base">
            Xem thêm <ChevronDown size={18} aria-hidden />
          </Link>
        )}
        <p className="text-center text-sm text-slate-500 tabular-nums">
          Đã xem {shownOnMobile.toLocaleString("vi-VN")} / {total.toLocaleString("vi-VN")}
        </p>
      </div>

      {/* Máy tính */}
      <nav aria-label="Phân trang" className="hidden flex-wrap items-center justify-between gap-3 sm:flex">
        <p className="text-sm text-slate-500 tabular-nums">
          {start + 1}–{Math.min(start + PAGE_SIZE, total)} / {total.toLocaleString("vi-VN")}
        </p>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Link href={href(page - 1)} aria-label="Trang trước" className={`${base} hover:bg-slate-100`}>
                <ChevronLeft size={16} aria-hidden />
              </Link>
            ) : (
              <span className={`${base} text-slate-300`} aria-hidden>
                <ChevronLeft size={16} />
              </span>
            )}
            {pages.map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-slate-400">
                  …
                </span>
              ) : (
                <Link
                  key={p}
                  href={href(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={`${base} ${
                    p === page ? "border border-[#1677ff] font-medium text-[#1677ff]" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {p}
                </Link>
              ),
            )}
            {page < pageCount ? (
              <Link href={href(page + 1)} aria-label="Trang sau" className={`${base} hover:bg-slate-100`}>
                <ChevronRight size={16} aria-hidden />
              </Link>
            ) : (
              <span className={`${base} text-slate-300`} aria-hidden>
                <ChevronRight size={16} />
              </span>
            )}
          </div>
        )}
      </nav>
    </>
  );
}
