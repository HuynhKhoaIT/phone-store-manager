import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths } from "@/lib/format";
import { NavInput } from "./NavInput";
import { DatePicker } from "./DatePicker";
import type { Period } from "@/lib/period";

type Params = Record<string, string | number | null | undefined>;

function query(params: Params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}

/**
 * Cụm chọn tháng dùng chung: ‹ [Tháng 10/2026] ›. Giữ nguyên các tham số khác (`params`, vd chi nhánh),
 * bỏ `page` vì đổi tháng thì về trang 1.
 */
export function MonthNav({ path, month, params = {} }: { path: string; month: string; params?: Params }) {
  const href = (m: string) => `${path}?${query({ ...params, month: m })}`;
  const rest = query(params);
  return (
    <div className="flex items-center gap-2">
      <Link href={href(addMonths(month, -1))} className="btn-secondary" aria-label="Tháng trước">
        <ChevronLeft size={16} aria-hidden />
      </Link>
      <NavInput type="month" value={month} hrefPrefix={`${path}?${rest ? `${rest}&` : ""}month=`} label="Chọn tháng" />
      <Link href={href(addMonths(month, 1))} className="btn-secondary" aria-label="Tháng sau">
        <ChevronRight size={16} aria-hidden />
      </Link>
    </div>
  );
}

/** Lọc chi nhánh dùng chung (Dashboard, Báo cáo). Giữ khoảng thời gian đang xem (`keep`: month hoặc from/to). */
export function BranchFilter({
  path,
  keep,
  branchId,
  branches,
}: {
  path: string;
  keep: Record<string, string>;
  branchId?: number;
  branches: { id: number; name: string }[];
}) {
  return (
    <form action={path} className="flex gap-2">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <select aria-label="Chi nhánh" name="branch" defaultValue={branchId ?? ""} className="input w-auto">
        <option value="">Tất cả chi nhánh</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <button className="btn-secondary">Lọc</button>
    </form>
  );
}

/**
 * Lọc từ ngày đến ngày (Dashboard, Báo cáo). Dùng cùng `MonthNav`: bấm ‹ › / chọn tháng thì quay về xem theo tháng.
 */
export function DateRangeFilter({ path, period, branchId }: { path: string; period: Period; branchId?: number }) {
  const isRange = period.mode === "range";
  return (
    <form
      action={path}
      className={`flex flex-wrap items-center gap-2 rounded-md ${isRange ? "bg-blue-50 p-1 ring-1 ring-blue-200" : ""}`}
    >
      {branchId && <input type="hidden" name="branch" value={branchId} />}
      <span className="pl-1 text-sm text-slate-500">Từ</span>
      <DatePicker name="from" value={isRange ? period.from : ""} label="Từ ngày" placeholder="Từ ngày" required />
      <span className="text-sm text-slate-500">đến</span>
      <DatePicker name="to" value={isRange ? period.to : ""} label="Đến ngày" placeholder="Đến ngày" required />
      <button className="btn-secondary">Xem</button>
      {isRange && (
        <Link href={`${path}?${query({ month: period.month, branch: branchId })}`} className="px-1 text-sm text-[#1677ff] hover:underline">
          Bỏ lọc ngày
        </Link>
      )}
    </form>
  );
}
