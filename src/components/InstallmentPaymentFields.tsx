"use client";

import { useState } from "react";
import { MoneyInput } from "./MoneyInput";
import { Segmented } from "./TransactionFields";

/** Ô nhập khi ghi nhận tiền trả góp (công ty tài chính chuyển phần còn lại) — mặc định CK, đúng số còn lại. */
export function InstallmentPaymentFields({
  transactionId,
  remaining,
  bankAccounts,
}: {
  transactionId: number;
  remaining: number;
  bankAccounts: string[];
}) {
  const [payment, setPayment] = useState<"CASH" | "TRANSFER">("TRANSFER");
  const listId = `installment-accounts-${transactionId}`;
  return (
    <>
      <input type="hidden" name="transactionId" value={transactionId} />
      <input type="hidden" name="paymentMethod" value={payment} />
      <div className="col-span-full">
        <Segmented
          label="Nhận bằng"
          value={payment}
          onChange={setPayment}
          options={[
            { value: "TRANSFER", label: "Chuyển khoản (CK)" },
            { value: "CASH", label: "Tiền mặt (TM)" },
          ]}
        />
      </div>
      <label className="field">
        <span>Số tiền nhận *</span>
        <MoneyInput name="amount" required defaultValue={remaining} />
      </label>
      {payment === "TRANSFER" && (
        <label className="field">
          <span>Tài khoản nhận tiền *</span>
          <input name="bankAccount" required list={listId} className="input" placeholder="VD: VCB - 0123456789" />
          <datalist id={listId}>
            {bankAccounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
      )}
      <label className="field sm:col-span-2">
        <span>Ghi chú</span>
        <input name="note" className="input" placeholder="VD: Home Credit giải ngân" />
      </label>
    </>
  );
}
