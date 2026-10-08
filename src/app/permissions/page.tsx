import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import { getStaffRoles } from "@/lib/roles";
import { deleteStaffRole, saveStaffRole, saveUserPermissions } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { UserPermissionFields } from "@/components/UserPermissionFields";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

type Search = { tab?: string; edit?: string; role?: string; page?: string };

/**
 * Phân quyền: tab Vai trò (bộ quyền dùng chung: Bán hàng, Kế toán...) và tab Theo nhân viên
 * (chọn vai trò + tick quyền riêng thêm). Quyền thực tế = quyền vai trò + quyền riêng. Admin luôn toàn quyền.
 */
export default async function PermissionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "users" ? "users" : "roles";
  const roles = await getStaffRoles();
  const roleOf = (id: number | null) => roles.find((r) => r.id === id) ?? null;
  const tabHref = (t: string) => (t === "roles" ? "/permissions" : `/permissions?tab=${t}`);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Phân quyền"
        subtitle="Tạo vai trò (bộ quyền) rồi gán cho nhân viên; có thể tick thêm quyền riêng. Admin luôn có toàn quyền."
        actions={
          tab === "roles" ? (
            <FormDialog title="Thêm vai trò" triggerLabel="Thêm vai trò">
              <RoleForm />
            </FormDialog>
          ) : (
            <Link href="/users" className="btn-secondary">
              Quản lý tài khoản
            </Link>
          )
        }
      />

      <nav className="flex gap-6 border-b border-slate-200 text-sm" aria-label="Phân quyền">
        {[
          { key: "roles", label: `Vai trò (${roles.length})` },
          { key: "users", label: "Theo nhân viên" },
        ].map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2.5 transition-colors ${
              tab === t.key ? "border-[#1677ff] font-medium text-[#1677ff]" : "border-transparent text-slate-600 hover:text-[#4096ff]"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "roles" ? (
        <RolesTab roles={roles} editingId={Number(sp.role) || null} />
      ) : (
        <UsersTab sp={sp} meId={me.id} roles={roles} roleOf={roleOf} />
      )}

      <div className="card text-sm text-slate-600">
        <p className="mb-1 font-semibold text-slate-800">Luôn chỉ admin (không gán được cho vai trò nào)</p>
        <p>
          Quản lý nhân viên, phân quyền, chi nhánh; sửa bảng giá và giá sửa chữa; xoá giao dịch; mở lại ca đã chốt;
          xoá phiếu nhập hàng; sửa / xoá dòng mượn hàng. Admin không vào ca. Nhân viên chỉ bán hàng trong ngày hôm nay,
          ở chi nhánh được phân công.
        </p>
      </div>
    </div>
  );
}

type RoleRow = Awaited<ReturnType<typeof getStaffRoles>>[number];

function RolesTab({ roles, editingId }: { roles: RoleRow[]; editingId: number | null }) {
  const editing = roles.find((r) => r.id === editingId);
  return (
    <>
      {editing && (
        <FormDialog key={editing.id} title={`Sửa vai trò: ${editing.name}`} defaultOpen closeHref="/permissions">
          <RoleForm role={editing} />
        </FormDialog>
      )}
      {roles.length === 0 && <p className="card text-center text-slate-500">Chưa có vai trò nào.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {roles.map((r) => (
          <section key={r.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold">{r.name}</h2>
                {r.description && <p className="text-sm text-slate-500">{r.description}</p>}
                <p className="mt-0.5 text-xs text-slate-400">{r._count.users} tài khoản</p>
              </div>
              <div className="flex shrink-0 gap-3">
                <Link href={`/permissions?role=${r.id}`} className="text-sm text-[#1677ff] hover:underline">
                  Sửa
                </Link>
                <ConfirmButton action={deleteStaffRole.bind(null, r.id)} message={`Xoá vai trò "${r.name}"?`}>
                  Xoá
                </ConfirmButton>
              </div>
            </div>
            <PermissionBadges permissions={r.permissions} />
          </section>
        ))}
      </div>
    </>
  );
}

function RoleForm({ role }: { role?: RoleRow }) {
  return (
    <ActionForm
      action={saveStaffRole}
      submitLabel={role ? "Lưu vai trò" : "Thêm vai trò"}
      successMessage={role ? "Đã lưu vai trò." : "Đã thêm vai trò."}
      className="grid gap-3"
    >
      {role && <input type="hidden" name="id" value={role.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field">
          <span>Tên vai trò *</span>
          <input name="name" required maxLength={40} defaultValue={role?.name} className="input" placeholder="VD: Thủ kho" />
        </label>
        <label className="field">
          <span>Mô tả</span>
          <input name="description" defaultValue={role?.description ?? ""} className="input" />
        </label>
      </div>
      <PermissionChecklist checked={role?.permissions ?? []} />
      {role && role._count.users > 0 && (
        <p className="text-xs text-slate-500">
          Áp dụng ngay cho {role._count.users} tài khoản đang dùng vai trò này (thấy menu mới khi chuyển trang).
        </p>
      )}
    </ActionForm>
  );
}

async function UsersTab({
  sp,
  meId,
  roles,
  roleOf,
}: {
  sp: Search;
  meId: number;
  roles: RoleRow[];
  roleOf: (id: number | null) => RoleRow | null;
}) {
  const paging = getPaging(await prisma.user.count(), sp.page);
  const select = {
    id: true,
    name: true,
    username: true,
    role: true,
    active: true,
    permissions: true,
    staffRoleId: true,
  } as const;
  const [users, editTarget] = await Promise.all([
    prisma.user.findMany({
      select,
      // id cuối để thứ tự cố định khi trùng tên — phân trang lấy theo `take`
      orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }, { id: "asc" }],
      take: paging.take,
    }),
    // Tìm riêng: người đang sửa có thể không nằm trong trang đang xem
    sp.edit ? prisma.user.findUnique({ where: { id: Number(sp.edit) || 0 }, select }) : null,
  ]);
  // Admin luôn toàn quyền nên chỉ sửa được quyền của nhân viên
  const editing = editTarget && editTarget.role !== "ADMIN" ? editTarget : null;
  const backHref = pageHref("/permissions", { tab: "users" })(paging.page);
  const editHref = (id: number) => `${backHref}&edit=${id}`;

  return (
    <>
      {editing && (
        <FormDialog key={editing.id} title={`Phân quyền: ${editing.name}`} defaultOpen closeHref={backHref}>
          <ActionForm action={saveUserPermissions} submitLabel="Lưu phân quyền" successMessage="Đã lưu phân quyền.">
            <input type="hidden" name="id" value={editing.id} />
            <UserPermissionFields
              roles={roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions }))}
              staffRoleId={editing.staffRoleId}
              extra={editing.permissions}
            />
          </ActionForm>
        </FormDialog>
      )}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Tài khoản</th>
              <th>Vai trò</th>
              <th>Quyền riêng thêm</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const role = roleOf(u.staffRoleId);
              const extra = u.permissions.filter((p) => !role?.permissions.includes(p));
              return (
                <tr key={u.id} className={`${u.active ? "" : "text-slate-400"} ${rowClass(paging, i)}`}>
                  <td data-title className="font-medium">
                    <span>
                      {u.name}
                      {u.id === meId && <span className="ml-1 text-xs font-normal text-slate-400">(bạn)</span>}
                      <span className="block text-xs font-normal text-slate-400">
                        {u.username}
                        {!u.active && " · Đã khoá"}
                      </span>
                    </span>
                  </td>
                  <td data-label="Vai trò">
                    {u.role === "ADMIN" ? (
                      <span className="badge bg-amber-100 text-amber-800">Admin · Toàn quyền</span>
                    ) : role ? (
                      <span className="badge bg-blue-50 text-blue-800">{role.name}</span>
                    ) : (
                      <span className="text-slate-400">Chưa gán</span>
                    )}
                  </td>
                  <td data-label="Quyền riêng">
                    {u.role === "ADMIN" || extra.length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <PermissionBadges permissions={extra} />
                    )}
                  </td>
                  <td className="text-right">
                    {u.role !== "ADMIN" && (
                      <Link href={editHref(u.id)} className="text-sm text-[#1677ff] hover:underline">
                        Phân quyền
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/permissions", { tab: "users" })} />
    </>
  );
}

function PermissionBadges({ permissions }: { permissions: string[] }) {
  const items = PERMISSIONS.filter((p) => permissions.includes(p.key));
  if (!items.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
      {items.map((p) => (
        <span key={p.key} className="badge bg-slate-100 text-slate-700">
          {p.label}
        </span>
      ))}
    </div>
  );
}

function PermissionChecklist({ checked }: { checked: string[] }) {
  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group} className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">{group}</legend>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            {PERMISSIONS.filter((p) => p.group === group).map((p) => (
              <label key={p.key} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  name="permissions"
                  value={p.key}
                  defaultChecked={checked.includes(p.key)}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{p.label}</span>
                  <span className="block text-xs text-slate-500">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
