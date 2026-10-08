import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getActiveBranches } from "@/lib/branch";
import { getStaffRoles } from "@/lib/roles";
import { saveUser } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = { edit?: string; branch?: string; page?: string };
type UserWithBranches = Prisma.UserGetPayload<{ include: { branches: { select: { id: true } } } }>;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const [branches, roles] = await Promise.all([getActiveBranches(), getStaffRoles()]);
  // Tài khoản mới mặc định vai trò bán hàng — không lấy vai trò đầu bảng (có thể là vai trò nhiều quyền)
  const defaultRole = roles.find((r) => r.name === "Bán hàng");
  const branchFilter = branches.find((b) => b.id === Number(sp.branch));

  // Lọc theo chi nhánh: người được phân công ở đó + người làm được mọi chi nhánh
  const where: Prisma.UserWhereInput = branchFilter
    ? { OR: [{ branches: { some: { id: branchFilter.id } } }, { branches: { none: {} } }] }
    : {};
  const paging = getPaging(await prisma.user.count({ where }), sp.page);
  const [users, editing] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { branches: { select: { id: true, name: true }, orderBy: { id: "asc" } } },
      // id cuối để thứ tự cố định khi trùng tên — phân trang lấy theo `take`
      orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }, { id: "asc" }],
      take: paging.take,
    }),
    sp.edit
      ? prisma.user.findUnique({ where: { id: Number(sp.edit) }, include: { branches: { select: { id: true } } } })
      : null,
  ]);
  // Giữ chi nhánh + trang hiện tại để đóng hộp sửa quay lại đúng chỗ
  const backHref = pageHref("/users", { branch: branchFilter?.id })(paging.page);
  const editHref = (id: number) => `${backHref}${backHref.includes("?") ? "&" : "?"}edit=${id}`;

  const renderForm = (editing?: UserWithBranches) => (
    <ActionForm
      action={saveUser}
      submitLabel={editing ? "Lưu thay đổi" : "Thêm nhân viên"}
      successMessage={editing ? "Đã lưu thay đổi." : "Đã thêm nhân viên."}
      className="grid gap-3 sm:grid-cols-2"
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
        <span>Vai trò</span>
        {/* Admin = toàn quyền; vai trò = bộ quyền ở trang Phân quyền; "chỉ quyền riêng" = tick từng quyền */}
        <select
          name="role"
          defaultValue={
            editing?.role === "ADMIN"
              ? "ADMIN"
              : editing?.staffRoleId
                ? `role:${editing.staffRoleId}`
                : editing
                  ? "STAFF"
                  : defaultRole
                    ? `role:${defaultRole.id}`
                    : "STAFF"
          }
          className="input"
        >
          {roles.map((r) => (
            <option key={r.id} value={`role:${r.id}`}>
              {r.name}
            </option>
          ))}
          <option value="STAFF">Nhân viên — chỉ quyền riêng</option>
          <option value="ADMIN">Admin (toàn quyền)</option>
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
                defaultChecked={editing ? editing.branches.some((x) => x.id === b.id) : branchFilter?.id === b.id}
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
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nhân viên"
        subtitle="Tài khoản, vai trò và chi nhánh được làm việc"
        actions={
          true && (
            <FormDialog title="Thêm nhân viên" triggerLabel="Thêm nhân viên">
              {renderForm()}
            </FormDialog>
          )
        }
      />

      {editing && (
        <FormDialog key={editing.id} title={`Sửa tài khoản: ${editing.name}`} defaultOpen closeHref={backHref}>
          {renderForm(editing)}
        </FormDialog>
      )}


      <div className="flex flex-wrap items-center gap-2">
        {[{ id: 0, name: "Tất cả" }, ...branches].map((b) => (
          <Link
            key={b.id}
            href={b.id ? `/users?branch=${b.id}` : "/users"}
            className={`rounded-md px-3 py-1 text-sm font-medium ring-1 ${
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
              <th>Vai trò</th>
              <th>Chi nhánh</th>
              <th>Trạng thái</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} className={`${u.active ? "" : "text-slate-400"} ${rowClass(paging, i)}`}>
                <td data-title className="font-medium">
                  <span>
                    {u.name}
                    {u.id === me.id && <span className="ml-1 text-xs font-normal text-slate-400">(bạn)</span>}
                  </span>
                </td>
                <td data-label="Tên đăng nhập">{u.username}</td>
                <td data-label="Vai trò">
                  <span
                    className={`badge ${u.role === "ADMIN" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
                  >
                    {u.role === "ADMIN" ? "Admin" : (roles.find((r) => r.id === u.staffRoleId)?.name ?? "Nhân viên")}
                  </span>
                </td>
                <td data-label="Chi nhánh">
                  {u.role === "ADMIN" || u.branches.length === 0 ? (
                    <span className="text-slate-500">Tất cả chi nhánh</span>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                      {u.branches.map((b) => (
                        <span key={b.id} className="badge bg-blue-50 text-blue-800">
                          {b.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td data-label="Trạng thái">{u.active ? "Đang làm" : "Đã khoá"}</td>
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

      <Pagination paging={paging} href={pageHref("/users", { branch: branchFilter?.id })} />

      <p className="text-sm text-slate-500">
        Chức năng từng nhân viên được dùng:{" "}
        <Link href="/permissions" className="text-[#1677ff] hover:underline">
          Phân quyền
        </Link>
        .
      </p>
    </div>
  );
}
