import { LogOut, TriangleAlert } from "lucide-react";
import type { Shift, Transaction } from "@prisma/client";
import { summarize } from "@/lib/summary";
import { formatTimeVN, formatVND, KIND_LABEL } from "@/lib/format";
import { addTransaction, closeShift, deleteTransaction, reopenShift } from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormDialog } from "@/components/FormDialog";
import { MoneyInput } from "@/components/MoneyInput";
import { TransactionFields, type PriceSuggestion } from "@/components/TransactionFields";

export function ShiftCard({
  shift,
  canEdit,
  isAdmin,
  defaultCheckOut,
  checklistLeft,
  bankAccounts,
  saleSuggestions,
  repairSuggestions,
}: {
  shift: Shift & { transactions: Transaction[] };
  canEdit: boolean;
  isAdmin: boolean;
  defaultCheckOut: string;
  checklistLeft: number;
  bankAccounts: string[];
  saleSuggestions: PriceSuggestion[];
  repairSuggestions: PriceSuggestion[];
}) {
  const sum = summarize(shift.transactions);
  const expectedCash = shift.openingCash + sum.cash;
  const closed = !!shift.closedAt;
  // Chỉ admin được xoá giao dịch (khi ca còn mở)
  const canDelete = canEdit && isAdmin;
  const diff = (shift.handoverCash ?? 0) - expectedCash;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            {shift.staffName}{" "}
            <span className={`badge align-middle ${closed ? "bg-slate-100 text-slate-600" : "bg-green-100 text-green-700"}`}>
              {closed ? "Đã chốt ca" : "Đang làm"}
            </span>
          </h2>
          <p className="text-sm text-slate-500">
            Vào ca {shift.checkIn}
            {shift.checkOut && ` · Ra về ${shift.checkOut}`} · Nhận đầu ca{" "}
            <b className="text-slate-700">{formatVND(shift.openingCash)}</b>
          </p>
        </div>
        {closed && isAdmin && (
          <ConfirmButton
            action={reopenShift.bind(null, shift.id)}
            message="Mở lại ca này để chỉnh sửa?"
            className="btn-secondary"
          >
            Mở lại ca
          </ConfirmButton>
        )}
        {canEdit && (
          <div className="flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
            <FormDialog title="Thêm giao dịch" triggerLabel="Thêm giao dịch">
              <ActionForm
                action={addTransaction}
                submitLabel="Lưu giao dịch"
                successMessage="Đã lưu giao dịch."
                className="grid gap-3 sm:grid-cols-2"
              >
                <TransactionFields
                  shiftId={shift.id}
                  bankAccounts={bankAccounts}
                  saleSuggestions={saleSuggestions}
                  repairSuggestions={repairSuggestions}
                />
              </ActionForm>
            </FormDialog>
            <FormDialog
              title="Kết thúc ca / Bàn giao"
              triggerLabel="Kết thúc ca"
              triggerVariant="secondary"
              triggerIcon={<LogOut size={16} aria-hidden />}
            >
              <div className="space-y-2 text-sm">
                {checklistLeft > 0 && (
                  <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">
                    <TriangleAlert size={16} className="mr-1 inline align-text-bottom" aria-hidden />
                    Còn {checklistLeft} việc trong checklist hôm nay chưa hoàn thành.
                  </p>
                )}
                <p className="mt-2 text-sm text-slate-600">
                  Tiền mặt phải có = nhận đầu ca {formatVND(shift.openingCash)} + tiền mặt bán được {formatVND(sum.cash)} ={" "}
                  <b>{formatVND(expectedCash)}</b>
                </p>
                <ActionForm
                  action={closeShift}
                  submitLabel="Chốt ca"
                  successMessage="Đã chốt ca."
                  confirmMessage="Chốt ca? Sau khi chốt sẽ không thể thêm/xoá giao dịch."
                  className="mt-3 grid gap-3 sm:grid-cols-2"
                >
                  <input type="hidden" name="shiftId" value={shift.id} />
                  <label className="field">
                    <span>Giờ ra về *</span>
                    <input name="checkOut" type="time" required defaultValue={defaultCheckOut} className="input" />
                  </label>
                  <label className="field">
                    <span>Tiền mặt bàn giao *</span>
                    <MoneyInput key={expectedCash} name="handoverCash" required defaultValue={expectedCash} />
                  </label>
                  <label className="field">
                    <span>Ghi chú</span>
                    <input name="closingNote" className="input" placeholder="VD: thiếu 20k do thối nhầm" />
                  </label>
                </ActionForm>
              </div>
            </FormDialog>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4">
        <Line label="Doanh thu ca" value={formatVND(sum.total)} />
        <Line label="Tiền mặt" value={formatVND(sum.cash)} />
        <Line label="Chuyển khoản" value={formatVND(sum.transfer)} />
        <Line label="Tiền mặt phải có" value={formatVND(expectedCash)} bold />
      </div>

      {shift.transactions.length > 0 ? (
        <>
        {/* Điện thoại: dạng danh sách */}
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 sm:hidden">
          {shift.transactions.map((t) => (
            <li key={t.id} className="space-y-1.5 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-medium">{t.productName}</p>
                <p className="shrink-0 font-semibold tabular-nums">{formatVND(t.price)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="tabular-nums">{formatTimeVN(t.createdAt)}</span>
                <KindBadge kind={t.kind} />
                <PaymentBadge method={t.paymentMethod} />
                {t.warrantyMonths > 0 && <span className="badge bg-slate-100 text-slate-700">BH {t.warrantyMonths} tháng</span>}
              </div>
              {t.paymentMethod === "TRANSFER" && t.bankAccount && (
                <p className="text-xs text-slate-500">TK nhận: {t.bankAccount}</p>
              )}
              {(t.customerName || t.customerPhone) && (
                <p className="text-sm text-slate-600">
                  {t.customerName}
                  {t.customerName && t.customerPhone && " · "}
                  {t.customerPhone}
                </p>
              )}
              {t.note && <p className="text-sm text-slate-500">{t.note}</p>}
              {canDelete && (
                <div className="text-right">
                  <ConfirmButton action={deleteTransaction.bind(null, t.id)} message={`Xoá giao dịch "${t.productName}"?`}>
                    Xoá
                  </ConfirmButton>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto sm:block">
          <table className="table">
            <thead>
              <tr>
                <th>Giờ</th>
                <th>Loại</th>
                <th>Sản phẩm / Dịch vụ</th>
                <th className="text-right">Giá</th>
                <th>TT</th>
                <th>Bảo hành</th>
                <th>Khách hàng</th>
                <th>Ghi chú</th>
                {canDelete && <th></th>}
              </tr>
            </thead>
            <tbody>
              {shift.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="text-slate-500 tabular-nums">{formatTimeVN(t.createdAt)}</td>
                  <td>
                    <KindBadge kind={t.kind} />
                  </td>
                  <td className="font-medium">{t.productName}</td>
                  <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatVND(t.price)}</td>
                  <td className="whitespace-nowrap">
                    <PaymentBadge method={t.paymentMethod} />
                    {t.paymentMethod === "TRANSFER" && <div className="text-xs text-slate-500">{t.bankAccount}</div>}
                  </td>
                  <td className="whitespace-nowrap">{t.warrantyMonths > 0 ? `${t.warrantyMonths} tháng` : "—"}</td>
                  <td>
                    {t.customerName}
                    {t.customerPhone && <div className="text-xs text-slate-500">{t.customerPhone}</div>}
                  </td>
                  <td className="text-slate-600">{t.note}</td>
                  {canDelete && (
                    <td>
                      <ConfirmButton
                        action={deleteTransaction.bind(null, t.id)}
                        message={`Xoá giao dịch "${t.productName}"?`}
                      >
                        Xoá
                      </ConfirmButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">Chưa có giao dịch nào.</p>
      )}

      {sum.byAccount.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-slate-600">Chuyển khoản theo tài khoản:</p>
          <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {sum.byAccount.map(([acc, amount]) => (
              <li key={acc}>
                {acc}: <b className="tabular-nums">{formatVND(amount)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {closed ? (
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="mb-2 font-semibold">Tổng kết ca</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <Line label="Giờ ra về" value={shift.checkOut ?? ""} />
            <Line label="Tiền mặt phải có" value={formatVND(expectedCash)} />
            <Line label="Tiền mặt bàn giao" value={formatVND(shift.handoverCash ?? 0)} bold />
            <div>
              <p className="text-xs text-slate-500">Chênh lệch</p>
              <p
                className={`font-semibold tabular-nums ${diff === 0 ? "text-green-700" : diff < 0 ? "text-red-600" : "text-amber-700"}`}
              >
                {diff === 0 ? "Khớp" : `${diff > 0 ? "+" : "−"}${formatVND(Math.abs(diff))} ${diff < 0 ? "(thiếu)" : "(dư)"}`}
              </p>
            </div>
          </div>
          {shift.closingNote && <p className="mt-2 text-slate-600">Ghi chú: {shift.closingNote}</p>}
        </div>
      ) : null}
    </section>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`tabular-nums ${bold ? "font-bold" : "font-medium"}`}>{value}</p>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  return (
    <span className={`badge ${kind === "REPAIR" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}`}>
      {KIND_LABEL[kind]}
    </span>
  );
}

function PaymentBadge({ method }: { method: string }) {
  return method === "TRANSFER" ? (
    <span className="badge bg-violet-100 text-violet-800">CK</span>
  ) : (
    <span className="badge bg-emerald-100 text-emerald-800">TM</span>
  );
}
