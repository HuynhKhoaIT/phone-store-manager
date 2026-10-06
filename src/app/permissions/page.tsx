import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PERMISSIONS, PERMISSION_GROUPS, can } from "@/lib/permissions";
import { saveUserPermissions } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { FormDialog } from "@/components/FormDialog";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { getPaging, pageHref, rowClass } from "@/lib/paging";

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; page?: string }>;
}) {
  const me = await requireAdmin();
  const { edit, page } = await searchParams;
  const paging = getPaging(await prisma.user.count(), page);
  const select = { id: true, name: true, username: true, role: true, active: true, permissions: true } as const;
  const [users, editTarget] = await Promise.all([
    prisma.user.findMany({
      select,
      // id cuối để thứ tự cố định khi trùng tên — phân trang lấy theo `take`
      orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }, { id: "asc" }],
      take: paging.take,
    }),
    // Tìm riêng: người đang sửa có thể không nằm trong trang đang xem
    edit ? prisma.user.findUnique({ where: { id: Number(edit) || 0 }, select }) : null,
  ]);
  // Admin luôn toàn quyền nên chỉ sửa được quyền của nhân viên
  const editing = editTarget?.role !== "ADMIN" ? editTarget : null;
  const backHref = pageHref("/permissions", {})(paging.page);
  const editHref = (id: number) => `${backHref}${backHref.includes("?") ? "&" : "?"}edit=${id}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Phân quyền"
        subtitle="Chọn chức năng từng nhân viên được dùng. Admin luôn có toàn quyền."
        actions={
          <Link href="/users" className="btn-secondary">
            Quản lý tài khoản
          </Link>
        }
      />

      {editing && (
        <FormDialog key={editing.id} title={`Phân quyền: ${editing.name}`} defaultOpen closeHref={backHref}>
          <ActionForm action={saveUserPermissions} submitLabel="Lưu phân quyền" successMessage="Đã lưu phân quyền.">
            <input type="hidden" name="id" value={editing.id} />
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
                          defaultChecked={editing.permissions.includes(p.key)}
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
            <p className="mt-3 text-xs text-slate-500">
              Nhân viên đang đăng nhập sẽ thấy menu mới khi chuyển trang.
            </p>
          </ActionForm>
        </FormDialog>
      )}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Tài khoản</th>
              {PERMISSION_GROUPS.map((g) => (
                <th key={g}>{g}</th>
              ))}
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
                    <span className="block text-xs font-normal text-slate-400">
                      {u.username}
                      {!u.active && " · Đã khoá"}
                    </span>
                  </span>
                </td>
                {PERMISSION_GROUPS.map((g) => {
                  const granted = PERMISSIONS.filter((p) => p.group === g && can(u, p.key));
                  return (
                    <td key={g} data-label={g}>
                      {u.role === "ADMIN" ? (
                        <span className="badge bg-amber-100 text-amber-800">Toàn quyền</span>
                      ) : granted.length === 0 ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-1 sm:justify-start">
                          {granted.map((p) => (
                            <span key={p.key} className="badge bg-blue-50 text-blue-800">
                              {p.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="text-right">
                  {u.role !== "ADMIN" && (
                    <Link href={editHref(u.id)} className="text-sm text-[#1677ff] hover:underline">
                      Phân quyền
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination paging={paging} href={pageHref("/permissions", {})} />

      <div className="card text-sm text-slate-600">
        <p className="mb-1 font-semibold text-slate-800">Luôn chỉ admin</p>
        <p>
          Quản lý nhân viên, phân quyền, chi nhánh; sửa bảng giá và giá sửa chữa; xem giá nhập; xoá giao dịch; mở lại
          ca đã chốt; xoá phiếu nhập hàng. Admin không vào ca. Nhân viên chỉ bán hàng trong ngày hôm nay, ở chi nhánh
          được phân công.
        </p>
      </div>
    </div>
  );
}
