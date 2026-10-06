/** Trạng thái hiển thị của một lần mượn hàng giữa chi nhánh (BranchLoan). */
export type LoanState = "BORROWED" | "RETURNED" | "UNPAID" | "PAID";

export const LOAN_STATE_LABEL: Record<LoanState, string> = {
  BORROWED: "Đang mượn",
  RETURNED: "Đã trả hàng",
  UNPAID: "Đã bán · chưa thanh toán",
  PAID: "Đã thanh toán",
};

export const LOAN_STATE_BADGE: Record<LoanState, string> = {
  BORROWED: "bg-blue-50 text-blue-800",
  RETURNED: "bg-slate-100 text-slate-600",
  UNPAID: "bg-amber-100 text-amber-800",
  PAID: "bg-green-100 text-green-800",
};

export function loanState(loan: { status: string; paidAt: Date | null }): LoanState {
  if (loan.status === "RETURNED") return "RETURNED";
  if (loan.status === "SOLD") return loan.paidAt ? "PAID" : "UNPAID";
  return "BORROWED";
}
