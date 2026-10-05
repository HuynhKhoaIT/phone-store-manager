import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { saveBranch } from "../actions";
import { ActionForm } from "@/components/ActionForm";

export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin();
  const { edit } = await searchParams;
  const branches = await prisma.branch.findMany({
    orderBy: [{ active: "desc" }, { id: "asc" }],
    include: {
      staff: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
      _count: { select: { shifts: true } },
    },
  });
  const editing = branches.find((b) => b.id === Number(edit));
  const unassigned = await prisma.user.findMany({
    where: { active: true, role: "STAFF", branches: { none: {} } },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Chi nhánh</h1>

      <div className="card">
        <h2 className="mb-3 font-semibold">{editing ? `Sửa: ${editing.name}` : "Thêm chi nhánh"}</h2>
        <ActionForm
          key={editing?.id ?? "new"}
          action={saveBranch}
          submitLabel={editing ? "Lưu thay đổi" : "Thêm chi nhánh"}
          successMessage={editing ? undefined : "Đã thêm chi nhánh."}
          redirectTo={editing ? "/branches" : undefined}
          className="grid gap-3 sm:grid-cols-3"
          extraButtons={
            editing && (
              <Link href="/branches" className="btn-secondary">
                Huỷ
              </Link>
            )
          }
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label className="field sm:col-span-2">
            <span>Tên chi nhánh *</span>
            <input name="name" required defaultValue={editing?.name} className="input" placeholder="VD: Chi nhánh 3" />
          </label>
          {editing && (
            <label className="field">
              <span>Trạng thái</span>
              <select name="active" defaultValue={String(editing.active)} className="input">
                <option value="true">Đang hoạt động</option>
                <option value="false">Ngừng hoạt động (ẩn)</option>
              </select>
            </label>
          )}
        </ActionForm>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {branches.map((b) => (
          <section key={b.id} className={`card ${b.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">
                  📍 {b.name}
                  {!b.active && <span className="badge ml-2 bg-slate-100 align-middle text-slate-500">Ngừng hoạt động</span>}
                </h2>
                <p className="text-sm text-slate-500">{b._count.shifts} ca làm việc đã ghi nhận</p>
              </div>
              <Link href={`/branches?edit=${b.id}`} className="text-sm text-blue-600 hover:underline">
                Sửa
              </Link>
            </div>
            <div className="mt-3 text-sm">
              <p className="font-medium text-slate-600">Nhân viên được phân công:</p>
              {b.staff.length > 0 ? (
                <p className="mt-1">{b.staff.map((s) => s.name).join(", ")}</p>
              ) : (
                <p className="mt-1 text-slate-400">Chưa có</p>
              )}
              <Link href={`/users?branch=${b.id}`} className="mt-2 inline-block text-blue-600 hover:underline">
                Xem / phân công nhân viên →
              </Link>
            </div>
          </section>
        ))}
      </div>

      {unassigned.length > 0 && (
        <p className="text-sm text-slate-500">
          Nhân viên làm được ở <b>mọi chi nhánh</b> (chưa giới hạn): {unassigned.map((u) => u.name).join(", ")}
        </p>
      )}
    </div>
  );
}
