import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getActiveBranches } from "@/lib/branch";
import { saveUser } from "../actions";
import { ActionForm } from "@/components/ActionForm";

type Search = { edit?: string; branch?: string };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const branches = await getActiveBranches();
  const branchFilter = branches.find((b) => b.id === Number(sp.branch));

  // Lọc theo chi nhánh: người được phân công ở đó + người làm được mọi chi nhánh
  const where: Prisma.UserWhereInput = branchFilter
    ? { OR: [{ branches: { some: { id: branchFilter.id } } }, { branches: { none: {} } }] }
    : {};
  const [users, editing] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { branches: { select: { id: true, name: true }, orderBy: { id: "asc" } } },
      orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
    }),
    sp.edit
      ? prisma.user.findUnique({ where: { id: Number(sp.edit) }, include: { branches: { select: { id: true } } } })
      : null,
  ]);
  const editingBranchIds = new Set(editing?.branches.map((b) => b.id) ?? (branchFilter ? [branchFilter.id] : []));
  const backHref = branchFilter ? `/users?branch=${branchFilter.id}` : "/users";
  const editHref = (id: number) => `/users?${new URLSearchParams({ ...(branchFilter && { branch: String(branchFilter.id) }), edit: String(id) })}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Nhân viên</h1>

      <div className="card">
        <h2 className="mb-3 font-semibold">{editing ? `Sửa tài khoản: ${editing.name}` : "Thêm nhân viên"}</h2>
        <ActionForm
          key={editing?.id ?? `new-${branchFilter?.id ?? ""}`}
          action={saveUser}
          submitLabel={editing ? "Lưu thay đổi" : "Thêm nhân viên"}
          successMessage={editing ? undefined : "Đã thêm nhân viên."}
          redirectTo={editing ? backHref : undefined}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          extraButtons={
            editing && (
              <Link href={backHref} className="btn-secondary">
                Huỷ
              </Link>
            )
          }
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label className="field">
            <span>Họ tên *</span>
            <input name="name" required defaultValue={editing?.name} className="input" />
          </label>
          <label className="field">
            <span>Tên đăng nhập *</span>
            <input
              name="username"
              required
              autoCapitalize="none"
              defaultValue={editing?.username}
              className="input"
              placeholder="vd: lan.nv"
            />
          </label>
          <label className="field">
            <span>{editing ? "Mật khẩu mới (để trống nếu không đổi)" : "Mật khẩu *"}</span>
            <input name="password" type="password" required={!editing} minLength={6} className="input" />
          </label>
          <label className="field">
            <span>Quyền</span>
            <select name="role" defaultValue={editing?.role ?? "STAFF"} className="input">
              <option value="STAFF">Nhân viên</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <label className="field">
            <span>Trạng thái</span>
            <select name="active" defaultValue={String(editing?.active ?? true)} className="input">
              <option value="true">Đang làm</option>
              <option value="false">Đã khoá (nghỉ việc)</option>
            </select>
          </label>
          <fieldset className="field col-span-full">
            <span>Chi nhánh được làm việc</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-slate-200 p-3">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="branchIds"
                    value={b.id}
                    defaultChecked={editingBranchIds.has(b.id)}
                    className="size-4"
                  />
                  {b.name}
                </label>
              ))}
            </div>
            <small className="text-slate-500">
              Không tick chi nhánh nào = làm được ở mọi chi nhánh. Khi đăng nhập, nhân viên chọn 1 trong các chi nhánh
              này để làm việc. Admin luôn vào được mọi chi nhánh.
            </small>
          </fieldset>
        </ActionForm>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[{ id: 0, name: "Tất cả" }, ...branches].map((b) => (
          <Link
            key={b.id}
            href={b.id ? `/users?branch=${b.id}` : "/users"}
            className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${
              (branchFilter?.id ?? 0) === b.id
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-600 ring-slate-200 hover:text-slate-900"
            }`}
          >
            {b.name}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Tên đăng nhập</th>
              <th>Quyền</th>
              <th>Chi nhánh</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "text-slate-400"}>
                <td className="font-medium">
                  {u.name}
                  {u.id === me.id && <span className="ml-1 text-xs text-slate-400">(bạn)</span>}
                </td>
                <td>{u.username}</td>
                <td>
                  <span
                    className={`badge ${u.role === "ADMIN" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
                  >
                    {u.role === "ADMIN" ? "Admin" : "Nhân viên"}
                  </span>
                </td>
                <td>
                  {u.role === "ADMIN" || u.branches.length === 0 ? (
                    <span className="text-slate-500">Tất cả chi nhánh</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.branches.map((b) => (
                        <span key={b.id} className="badge bg-blue-50 text-blue-800">
                          {b.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>{u.active ? "Đang làm" : "Đã khoá"}</td>
                <td className="text-right">
                  <Link href={editHref(u.id)} className="text-sm text-blue-600 hover:underline">
                    Sửa
                  </Link>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Chưa có nhân viên nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card text-sm text-slate-600">
        <p className="mb-1 font-semibold text-slate-800">Phân quyền</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>Nhân viên</b>: chọn chi nhánh khi đăng nhập, vào ca và bán hàng trong ngày hôm nay tại chi nhánh đó, chốt
            ca của mình, xem bảng giá, tra cứu bảo hành, ghi phiếu nhập hàng.
          </li>
          <li>
            <b>Admin</b>: tất cả quyền trên ở mọi chi nhánh, cộng thêm xem lịch sử, dashboard doanh thu, sửa bảng giá,
            mở lại ca đã chốt, xoá phiếu nhập hàng, quản lý nhân viên và chi nhánh.
          </li>
        </ul>
      </div>
    </div>
  );
}
