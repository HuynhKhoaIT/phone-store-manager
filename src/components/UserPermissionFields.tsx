"use client";

import { useState } from "react";
import { PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";

type RoleOption = { id: number; name: string; permissions: string[] };

/**
 * Phân quyền một nhân viên: chọn vai trò (quyền của vai trò tick sẵn, không bỏ được ở đây) + tick quyền riêng thêm.
 * Ô của quyền vai trò bị khoá nên không gửi lên — server chỉ lưu quyền riêng.
 */
export function UserPermissionFields({
  roles,
  staffRoleId,
  extra,
}: {
  roles: RoleOption[];
  staffRoleId: number | null;
  extra: string[];
}) {
  const [roleId, setRoleId] = useState(staffRoleId ? String(staffRoleId) : "");
  const role = roles.find((r) => String(r.id) === roleId);
  const [own, setOwn] = useState(() => new Set(extra));

  return (
    <div className="space-y-4">
      <label className="field">
        <span>Vai trò</span>
        <select name="staffRoleId" value={roleId} onChange={(e) => setRoleId(e.target.value)} className="input">
          <option value="">— Không gán (chỉ quyền riêng) —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group} className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">{group}</legend>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            {PERMISSIONS.filter((p) => p.group === group).map((p) => {
              const fromRole = !!role?.permissions.includes(p.key);
              return (
                <label key={p.key} className={`flex items-start gap-2 ${fromRole ? "opacity-80" : ""}`}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p.key}
                    checked={fromRole || own.has(p.key)}
                    disabled={fromRole}
                    onChange={(e) =>
                      setOwn((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(p.key);
                        else next.delete(p.key);
                        return next;
                      })
                    }
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      {p.label}
                      {fromRole && <span className="ml-1.5 badge bg-blue-50 text-xs font-normal text-blue-700">vai trò</span>}
                    </span>
                    <span className="block text-xs text-slate-500">{p.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-slate-500">
        Quyền gắn nhãn &quot;vai trò&quot; sửa ở tab Vai trò. Nhân viên đang đăng nhập sẽ thấy menu mới khi chuyển trang.
      </p>
    </div>
  );
}
