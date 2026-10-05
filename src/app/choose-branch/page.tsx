import { requireUser } from "@/lib/auth";
import { getAllowedBranches, getCurrentBranch } from "@/lib/branch";
import { chooseBranch } from "../actions";

export default async function ChooseBranchPage() {
  const user = await requireUser();
  const [allowed, current] = await Promise.all([getAllowedBranches(user), getCurrentBranch()]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Chọn chi nhánh làm việc</h1>
      <p className="text-sm text-slate-500">
        Ca làm và các giao dịch bán hàng sẽ được lưu vào chi nhánh bạn chọn.
      </p>
      {allowed.length === 0 && (
        <p className="card text-sm text-red-700">
          Tài khoản của bạn chưa được phân công chi nhánh nào. Vui lòng liên hệ admin.
        </p>
      )}
      <div className="grid gap-2">
        {allowed.map((b) => (
          <form
            key={b.id}
            action={async () => {
              "use server";
              await chooseBranch(b.id);
            }}
          >
            <button
              className={`card flex w-full items-center justify-between text-left hover:border-blue-400 hover:bg-blue-50 ${
                current?.id === b.id ? "border-blue-500" : ""
              }`}
            >
              <span className="font-semibold">📍 {b.name}</span>
              {current?.id === b.id && <span className="text-sm text-blue-600">Đang chọn</span>}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
