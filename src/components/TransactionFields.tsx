"use client";

import { useState } from "react";
import { Gift, Plus, X } from "lucide-react";
import { MoneyInput } from "./MoneyInput";
import { Autocomplete } from "./Autocomplete";

export type PriceSuggestion = {
  label: string;
  price: number;
  warrantyMonths?: number;
  productId?: number;
  ownerBranchId?: number | null;
  ownerName?: string;
  /** Số lượng còn (hàng đếm được); máy có IMEI không có */
  quantity?: number;
  /** Phụ kiện — chọn làm quà tặng kèm được */
  giftable?: boolean;
  /** Giá trước khuyến mãi (khi `price` đã trừ chương trình giảm giá) */
  listPrice?: number;
  /** Ưu đãi đang áp dụng, vd "Sale 10/10: Giảm 10% · Tặng ốp: Tặng ốp lưng" */
  promo?: string;
};

export function TransactionFields({
  shiftId,
  bankAccounts,
  saleSuggestions,
  repairSuggestions,
  giftOptions = [],
  installment = false,
}: {
  shiftId: number;
  bankAccounts: string[];
  saleSuggestions: PriceSuggestion[];
  repairSuggestions: PriceSuggestion[];
  /** Phụ kiện còn hàng để tặng kèm (giá 0 đ) */
  giftOptions?: PriceSuggestion[];
  /** Bán trả góp qua công ty tài chính: chỉ bán hàng, nhập trả trước + công ty tài chính */
  installment?: boolean;
}) {
  const [kind, setKind] = useState<Kind>("SALE");
  const [downPayment, setDownPayment] = useState("");
  const [payment, setPayment] = useState<"CASH" | "TRANSFER">("CASH");
  const [price, setPrice] = useState("");
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [warranty, setWarranty] = useState(0);
  // Trả góp luôn cần thông tin khách (hợp đồng với công ty tài chính)
  // Bán SIM / nạp card: không bảo hành, không quà tặng
  const isSim = kind === "SIM" || kind === "TOPUP";
  const needCustomer = installment || (!isSim && warranty > 0);
  const financed = Math.max(0, Number(price || 0) - Number(downPayment || 0));
  // Trả góp không trả trước thì không có tiền vào → không cần chọn TM / CK
  const receivesMoney = !installment || Number(downPayment || 0) > 0;
  const suggestions = kind === "REPAIR" ? repairSuggestions : saleSuggestions;
  const accountListId = `bank-accounts-${shiftId}`;
  const selectedPromo = productId ? saleSuggestions.find((s) => String(s.productId) === productId && s.promo) : undefined;

  function selectSuggestion(match: PriceSuggestion) {
    setProductName(match.label);
    // Chỉ giữ liên kết sản phẩm khi chọn đúng gợi ý (để đánh dấu máy có IMEI là đã bán)
    setProductId(kind === "SALE" && match.productId ? String(match.productId) : "");
    setPrice(String(match.price));
    if (match.warrantyMonths != null) setWarranty(match.warrantyMonths);
  }

  function onProductType(text: string) {
    setProductName(text);
    const match = suggestions.find((s) => s.label === text);
    if (match) selectSuggestion(match);
    else setProductId("");
  }

  function changeKind(k: Kind) {
    // Đổi loại thì gợi ý cũ không còn đúng danh sách
    if (k !== kind) setProductId("");
    setKind(k);
  }

  return (
    <>
      <input type="hidden" name="shiftId" value={shiftId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="paymentMethod" value={payment} />
      <input type="hidden" name="productId" value={kind === "SALE" ? productId : ""} />
      {installment && <input type="hidden" name="installment" value="1" />}

      {!installment && (
        <div className="col-span-full flex flex-wrap gap-3">
          <Segmented
            label="Loại"
            value={kind === "TOPUP" ? "SIM" : kind}
            onChange={changeKind}
            options={[
              { value: "SALE", label: "Bán hàng" },
              { value: "REPAIR", label: "Sửa chữa" },
              { value: "SIM", label: "SIM" },
            ]}
          />
          <PaymentSegmented value={payment} onChange={setPayment} />
        </div>
      )}

      {isSim ? (
        <SimFields mode={kind === "TOPUP" ? "TOPUP" : "SIM"} onModeChange={setKind} />
      ) : (
      <>
      <div className="field sm:col-span-2">
        <span>{kind === "REPAIR" ? "Nội dung sửa chữa *" : "Tên sản phẩm *"}</span>
        <Autocomplete
          name="productName"
          required
          value={productName}
          onChange={onProductType}
          onSelect={selectSuggestion}
          options={suggestions}
          getLabel={suggestionLabel}
          renderMeta={suggestionMeta}
          ariaLabel={kind === "REPAIR" ? "Nội dung sửa chữa" : "Tên sản phẩm"}
          placeholder={kind === "REPAIR" ? "Gõ để tìm trong bảng giá sửa chữa..." : "Gõ tên, IMEI hoặc mã để tìm..."}
        />
        {kind === "SALE" && selectedPromo && (
          <small className="text-red-600">
            Khuyến mãi: {selectedPromo.promo}
            {selectedPromo.listPrice != null && ` (giá gốc ${selectedPromo.listPrice.toLocaleString("vi-VN")} đ)`}
          </small>
        )}
        {kind === "SALE" && productName && !productId && (
          <small className="text-amber-700">Không chọn từ danh sách hàng hoá — sẽ lưu theo tên đã gõ.</small>
        )}
      </div>
      <label className="field">
        <span>{installment ? "Giá bán *" : "Giá tiền *"}</span>
        <MoneyInput name="price" required value={price} onChange={setPrice} />
      </label>
      </>
      )}

      {installment && (
        <>
          <label className="field">
            <span>Công ty tài chính *</span>
            <input
              name="financeCompany"
              required
              list={`finance-companies-${shiftId}`}
              autoComplete="off"
              className="input"
              placeholder="VD: Home Credit"
            />
            <datalist id={`finance-companies-${shiftId}`}>
              {FINANCE_COMPANIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Số hợp đồng</span>
            <input name="financeContract" autoComplete="off" className="input" />
          </label>
          <label className="field">
            <span>Khách trả trước *</span>
            <MoneyInput name="downPayment" required value={downPayment} onChange={setDownPayment} />
          </label>
          <div className="field">
            <span>Còn lại (công ty tài chính trả)</span>
            <p className="flex h-10 items-center rounded-md bg-fuchsia-50 px-3 font-semibold text-fuchsia-800 tabular-nums">
              {financed.toLocaleString("vi-VN")} đ
            </p>
          </div>
          {receivesMoney && (
            <div className="col-span-full">
              <PaymentSegmented value={payment} onChange={setPayment} label="Khách trả trước bằng" />
            </div>
          )}
        </>
      )}

      {payment === "TRANSFER" && receivesMoney && (
        <label className="field">
          <span>Tài khoản nhận tiền *</span>
          <input
            name="bankAccount"
            required
            list={accountListId}
            className="input"
            placeholder="VD: VCB - 0123456789"
          />
          <datalist id={accountListId}>
            {bankAccounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
      )}

      {!isSim && (
      <label className="field">
        <span>Bảo hành</span>
        <select
          name="warrantyMonths"
          value={warranty}
          onChange={(e) => setWarranty(Number(e.target.value))}
          className="input"
        >
          {Array.from({ length: 13 }, (_, m) => (
            <option key={m} value={m}>
              {m === 0 ? "Không bảo hành" : `${m} tháng`}
            </option>
          ))}
        </select>
      </label>
      )}
      <label className="field">
        <span>Tên khách hàng{needCustomer && " *"}</span>
        <input name="customerName" required={needCustomer} className="input" />
      </label>
      <label className="field">
        <span>Số điện thoại{needCustomer && " *"}</span>
        <input name="customerPhone" type="tel" inputMode="tel" required={needCustomer} className="input" />
      </label>
      {needCustomer && (
        <p className="col-span-full -mt-1 text-xs text-amber-700">
          {installment
            ? "Bán trả góp: bắt buộc nhập tên và số điện thoại khách."
            : "Có bảo hành: bắt buộc nhập tên và số điện thoại khách để tra cứu sau này."}
        </p>
      )}
      {kind === "SALE" && <GiftList options={giftOptions} />}
      <label className="field sm:col-span-2">
        <span>Ghi chú</span>
        <input name="note" className="input" />
      </label>
    </>
  );
}

type Kind = "SALE" | "REPAIR" | "SIM" | "TOPUP";

const SIM_CARRIERS = ["Viettel", "MobiFone", "Vinaphone", "Vietnamobile", "iTel", "Wintel", "Local"];

const TOPUP_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

/**
 * Bán SIM / nạp card: chọn số + đấu nối, nạp tiền vẫn làm trên app nhà mạng, ở đây chỉ ghi nhận.
 * Server tính giá: SIM = giá SIM + giá gói cước, nạp card = số tiền nạp. Cả hai không có lãi (giá vốn = giá thu).
 */
function SimFields({ mode, onModeChange }: { mode: "SIM" | "TOPUP"; onModeChange: (k: Kind) => void }) {
  const [simPrice, setSimPrice] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [amount, setAmount] = useState("");
  const total = Number(simPrice || 0) + Number(planPrice || 0);
  const topup = mode === "TOPUP";
  return (
    <>
      <div className="col-span-full">
        <Segmented
          label="Loại SIM"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "SIM", label: "Bán SIM" },
            { value: "TOPUP", label: "Nạp card" },
          ]}
        />
      </div>
      <label className="field">
        <span>Nhà mạng *</span>
        <select name="simCarrier" required defaultValue="Viettel" className="input">
          {SIM_CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {!topup && (
        <label className="field">
          <span>Số thuê bao *</span>
          <input
            name="simNumber"
            required
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            className="input"
            placeholder="VD: 0987 654 321"
          />
        </label>
      )}
      {topup ? (
        <div className="field">
          <span>Số tiền nạp *</span>
          <MoneyInput name="topupAmount" required value={amount} onChange={setAmount} />
          <div className="flex flex-wrap gap-1.5">
            {TOPUP_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                className={`rounded border px-2 py-0.5 text-xs tabular-nums ${
                  amount === String(a)
                    ? "border-[#1677ff] bg-blue-50 text-[#1677ff]"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {a / 1000}k
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Serial SIM</span>
            <input name="simSerial" inputMode="numeric" autoComplete="off" className="input" placeholder="Số in trên SIM" />
          </label>
          <label className="field">
            <span>Giá SIM *</span>
            <MoneyInput name="simPrice" required value={simPrice} onChange={setSimPrice} />
          </label>
          <label className="field">
            <span>Giá gói cước</span>
            <MoneyInput name="simPlanPrice" value={planPrice} onChange={setPlanPrice} />
          </label>
          <div className="field">
            <span>Tổng thu</span>
            <p className="flex h-10 items-center rounded-md bg-blue-50 px-3 font-semibold text-blue-800 tabular-nums">
              {total.toLocaleString("vi-VN")} đ
            </p>
          </div>
        </>
      )}
      <p className="col-span-full -mt-1 text-xs text-slate-500">
        {topup ? "Nạp card" : "Bán SIM"} không tính lãi — chỉ ghi nhận tiền thu.
      </p>
    </>
  );
}

/** Công ty tài chính hay gặp — gợi ý khi nhập, vẫn gõ tên khác được */
const FINANCE_COMPANIES = ["Home Credit", "FE Credit", "HD Saison", "Mcredit", "Shinhan Finance", "Mirae Asset", "Samsung Finance+", "Kredivo", "Home PayLater"];

function PaymentSegmented({
  value,
  onChange,
  label = "Thanh toán",
}: {
  value: "CASH" | "TRANSFER";
  onChange: (v: "CASH" | "TRANSFER") => void;
  label?: string;
}) {
  return (
    <Segmented
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: "CASH", label: "Tiền mặt (TM)" },
        { value: "TRANSFER", label: "Chuyển khoản (CK)" },
      ]}
    />
  );
}

const suggestionLabel = (s: PriceSuggestion) => s.label;
const giftMeta = (s: PriceSuggestion) => (s.quantity != null ? `Còn ${s.quantity}` : "");
const suggestionMeta = (s: PriceSuggestion) =>
  `${s.price > 0 ? `${s.price.toLocaleString("vi-VN")} đ` : "Liên hệ"}${s.promo ? " · KM" : ""}`;

/**
 * Quà tặng kèm khi bán (sạc, tai nghe, ốp lưng, cường lực...): chọn phụ kiện của cửa hàng + số lượng.
 * Giá 0 đ; server trừ số lượng và cộng giá nhập vào giá vốn giao dịch. Chỉ nhận món chọn đúng trong danh sách.
 */
function GiftList({ options }: { options: PriceSuggestion[] }) {
  const [rows, setRows] = useState<{ key: number; text: string; qty: number }[]>([]);
  const update = (key: number, patch: Partial<{ text: string; qty: number }>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  return (
    <fieldset className="col-span-full rounded-md border border-slate-200 p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-slate-700">
        <Gift size={16} className="text-rose-500" aria-hidden /> Quà tặng kèm
      </legend>
      <div className="space-y-2">
        {rows.map((r) => {
          const match = options.find((o) => o.label === r.text);
          return (
            <div key={r.key}>
              <div className="flex items-center gap-2">
                <Autocomplete
                  value={r.text}
                  onChange={(text) => update(r.key, { text })}
                  onSelect={(o) => update(r.key, { text: o.label })}
                  options={options}
                  getLabel={suggestionLabel}
                  renderMeta={giftMeta}
                  ariaLabel="Phụ kiện tặng"
                  placeholder="Gõ tên hoặc mã phụ kiện..."
                  className="min-w-0 flex-1"
                />
                <input
                  type="number"
                  name="giftQty"
                  min={1}
                  max={99}
                  value={r.qty}
                  onChange={(e) => update(r.key, { qty: Number(e.target.value) })}
                  aria-label="Số lượng"
                  className="input w-16 shrink-0 text-center tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
                  aria-label="Bỏ quà này"
                  className="shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
              {/* Server chỉ nhận id: chưa khớp danh sách thì gửi rỗng → báo lỗi rõ ràng */}
              <input type="hidden" name="giftProductId" value={match?.productId ?? ""} />
              {r.text && !match && <small className="text-amber-700">Chọn đúng một phụ kiện trong danh sách gợi ý.</small>}
              {match?.quantity != null && r.qty > match.quantity && (
                <small className="text-amber-700">Chỉ còn {match.quantity} — vẫn lưu được, nhớ kiểm kho.</small>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setRows((r) => [...r, { key: Date.now(), text: "", qty: 1 }])}
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#1677ff] hover:underline"
      >
        <Plus size={16} aria-hidden /> Thêm quà tặng
      </button>
      {rows.length > 0 && <p className="mt-1 text-xs text-slate-500">Quà tặng tính 0 đ, tự trừ số lượng trong kho.</p>}
    </fieldset>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
