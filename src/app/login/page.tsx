import { Smartphone } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getActiveBranches } from "@/lib/branch";
import { login, setupFirstAdmin } from "../actions";
import { ActionForm } from "@/components/ActionForm";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  const firstRun = (await prisma.user.count()) === 0;
  const branches = firstRun ? [] : await getActiveBranches();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[#1677ff] text-white">
            <Smartphone size={22} aria-hidden />
          </span>
          <h1 className="text-xl font-bold">Quản lý cửa hàng</h1>
        </div>
        {firstRun ? (
          <>
            <p className="mb-4 text-sm text-slate-500">
              Thiết lập lần đầu: tạo tài khoản admin và chi nhánh đầu tiên. Có thể thêm chi nhánh, nhân viên sau.
            </p>
            <ActionForm action={setupFirstAdmin} submitLabel="Tạo tài khoản admin" className="grid gap-3">
              <label className="field">
                <span>Họ tên</span>
                <input name="name" required className="input" />
              </label>
              <label className="field">
                <span>Tên đăng nhập</span>
                <input name="username" required autoCapitalize="none" className="input" />
              </label>
              <label className="field">
                <span>Mật khẩu</span>
                <input name="password" type="password" required minLength={6} className="input" />
              </label>
              <label className="field">
                <span>Tên chi nhánh</span>
                <input name="branchName" required className="input" placeholder="VD: Chi nhánh Quận 1" />
              </label>
            </ActionForm>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500">Đăng nhập và chọn chi nhánh làm việc hôm nay.</p>
            <ActionForm action={login} submitLabel="Đăng nhập" className="grid gap-3">
              <label className="field">
                <span>Tên đăng nhập</span>
                <input name="username" required autoCapitalize="none" autoComplete="username" className="input" />
              </label>
              <label className="field">
                <span>Mật khẩu</span>
                <input name="password" type="password" required autoComplete="current-password" className="input" />
              </label>
              {branches.length > 1 ? (
                <label className="field">
                  <span>Chi nhánh làm việc</span>
                  <select name="branchId" required defaultValue="" className="input">
                    <option value="" disabled>
                      — Chọn chi nhánh —
                    </option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                branches[0] && <input type="hidden" name="branchId" value={branches[0].id} />
              )}
            </ActionForm>
          </>
        )}
      </div>
    </div>
  );
}
