import { requireUser } from "@/lib/auth";
import { changeOwnPassword } from "../actions";
import { ActionForm } from "@/components/ActionForm";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Tài khoản của tôi</h1>
      <div className="card text-sm">
        <p>
          <span className="text-slate-500">Họ tên:</span> <b>{user.name}</b>
        </p>
        <p>
          <span className="text-slate-500">Tên đăng nhập:</span> {user.username}
        </p>
        <p>
          <span className="text-slate-500">Vai trò:</span> {user.roleName ?? "Nhân viên"}
        </p>
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold">Đổi mật khẩu</h2>
        <ActionForm action={changeOwnPassword} submitLabel="Đổi mật khẩu" successMessage="Đã đổi mật khẩu." className="grid gap-3">
          <label className="field">
            <span>Mật khẩu hiện tại</span>
            <input name="currentPassword" type="password" required className="input" />
          </label>
          <label className="field">
            <span>Mật khẩu mới</span>
            <input name="newPassword" type="password" required minLength={6} autoComplete="new-password" className="input" />
          </label>
          <label className="field">
            <span>Nhập lại mật khẩu mới</span>
            <input name="confirmPassword" type="password" required minLength={6} autoComplete="new-password" className="input" />
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
