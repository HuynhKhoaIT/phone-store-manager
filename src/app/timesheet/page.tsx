import { MapPin } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { formatDateLong, formatMonth, isValidMonth, todayVN } from "@/lib/format";
import { MonthNav } from "@/components/MonthNav";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = { month?: string; user?: string; page?: string };

/** Số phút giữa giờ vào và giờ ra (HH:mm); ca qua đêm thì cộng 24h. */
function workedMinutes(checkIn: string, checkOut: string | null) {
  if (!checkOut) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(checkOut) - toMin(checkIn);
  return diff >= 0 ? diff : diff + 24 * 60;
}

function formatHours(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requirePermission("timesheet");
  const isAdmin = me.role === "ADMIN";
  const sp = await searchParams;
  const month = sp.month && isValidMonth(sp.month) ? sp.month : todayVN().slice(0, 7);

  // Nhân viên chỉ xem của mình; admin chọn nhân viên để xem (admin không vào ca)
  const staffList = isAdmin
    ? await prisma.user.findMany({
        where: { role: "STAFF" },
        select: { id: true, name: true, active: true },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      })
    : [];
  const userId = isAdmin
    ? (staffList.find((u) => u.id === Number(sp.user)) ?? staffList[0])?.id ?? me.id
    : me.id;
  const userName = staffList.find((u) => u.id === userId)?.name ?? me.name;

  const shifts = await prisma.shift.findMany({
    where: { userId, date: { startsWith: month } },
    include: { branch: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { checkIn: "asc" }, { id: "asc" }],
  });

  const rows = shifts.map((s) => ({ ...s, minutes: workedMinutes(s.checkIn, s.checkOut) }));
  const totalMinutes = rows.reduce((sum, r) => sum + (r.minutes ?? 0), 0);
  const workDays = new Set(rows.map((r) => r.date)).size;
  const byBranch = new Map<string, { days: Set<string>; minutes: number }>();
  for (const r of rows) {
    const b = byBranch.get(r.branch.name) ?? { days: new Set(), minutes: 0 };
    b.days.add(r.date);
    b.minutes += r.minutes ?? 0;
    byBranch.set(r.branch.name, b);
  }
  // Tổng tháng ở trên tính từ mọi ca; chỉ bảng chi tiết là phân trang
  const paging = getPaging(rows.length, sp.page);
  const shown = rows.slice(0, paging.take);

  const qs = (patch: Search) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ month, user: userId !== me.id ? String(userId) : "", ...patch }))
      if (v) p.set(k, v);
    return `/timesheet?${p}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Chấm công — {formatMonth(month)}</h1>
          <p className="text-sm text-slate-500">{userName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <form action="/timesheet" className="flex gap-2">
              <input type="hidden" name="month" value={month} />
              <select name="user" defaultValue={userId} aria-label="Nhân viên" className="input w-auto">
                {staffList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.active ? "" : " (đã nghỉ)"}
                  </option>
                ))}
              </select>
              <button className="btn-secondary">Xem</button>
            </form>
          )}
          <MonthNav path="/timesheet" month={month} params={{ user: userId !== me.id ? userId : "" }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card">
          <p className="text-xs font-medium text-slate-500">Số ngày làm</p>
          <p className="mt-1 text-2xl font-bold text-blue-700 tabular-nums">{workDays}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500">Tổng giờ làm</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{formatHours(totalMinutes)}</p>
        </div>
        {[...byBranch].map(([name, b]) => (
          <div key={name} className="card">
            <p className="flex items-center gap-1 text-xs font-medium text-slate-500">
              <MapPin size={12} aria-hidden /> {name}
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums">{b.days.size} ngày</p>
            <p className="text-xs text-slate-500">{formatHours(b.minutes)}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Chi nhánh</th>
              <th>Giờ vào</th>
              <th>Giờ ra</th>
              <th className="text-right">Số giờ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id} className={rowClass(paging, i)}>
                <td data-title className="whitespace-nowrap">
                  {isAdmin ? (
                    <Link href={`/day/${r.date}`} className="text-blue-600 hover:underline">
                      {formatDateLong(r.date)}
                    </Link>
                  ) : (
                    formatDateLong(r.date)
                  )}
                </td>
                <td data-label="Chi nhánh">{r.branch.name}</td>
                <td data-label="Giờ vào" className="tabular-nums">
                  {r.checkIn}
                </td>
                <td data-label="Giờ ra" className="tabular-nums">
                  {r.checkOut ?? <span className="badge bg-green-100 text-green-700">Đang làm</span>}
                </td>
                <td data-label="Số giờ" className="text-right font-medium tabular-nums">
                  {r.minutes != null ? formatHours(r.minutes) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Chưa có ca làm việc nào trong tháng.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={4} className="px-3 py-2 max-sm:hidden">
                  Tổng cộng ({workDays} ngày)
                </td>
                <td data-label={`Tổng cộng (${workDays} ngày)`} className="px-3 py-2 text-right tabular-nums">
                  {formatHours(totalMinutes)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/timesheet", { month, user: userId !== me.id ? userId : "" })} />
    </div>
  );
}
