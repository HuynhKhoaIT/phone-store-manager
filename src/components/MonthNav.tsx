import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths } from "@/lib/format";
import { NavInput } from "./NavInput";

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

/** Lọc chi nhánh dùng chung (Dashboard, Báo cáo). Giữ tháng đang xem. */
export function BranchFilter({
  path,
  month,
  branchId,
  branches,
}: {
  path: string;
  month: string;
  branchId?: number;
  branches: { id: number; name: string }[];
}) {
  return (
    <form action={path} className="flex gap-2">
      <input type="hidden" name="month" value={month} />
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
