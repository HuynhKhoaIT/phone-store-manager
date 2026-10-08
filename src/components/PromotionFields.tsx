"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { CATEGORY_LABEL, CONDITION_LABEL } from "@/lib/product-labels";
import { PROMOTION_TYPE_LABEL, discountText } from "@/lib/promotion-labels";
import { Autocomplete } from "./Autocomplete";
import { DatePicker } from "./DatePicker";
import { MoneyInput } from "./MoneyInput";

export type PromotionFormValue = {
  id: number;
  title: string;
  slug: string;
  type: string;
  discountType: string | null;
  discountValue: number | null;
  maxDiscount: number | null;
  summary: string;
  content: string;
  bannerUrl: string | null;
  startDate: string;
  endDate: string | null;
  categories: string[];
  brandIds: number[];
  conditions: string[];
  productIds: number[];
  branchIds: number[];
  active: boolean;
  showOnWeb: boolean;
  featured: boolean;
  sortOrder: number;
};

type Option = { id: number; label: string };
const optionLabel = (o: Option) => o.label;

const SUMMARY_PLACEHOLDER: Record<string, string> = {
  DISCOUNT: "Để trống = tự ghi theo mức giảm",
  GIFT: "VD: Tặng ốp lưng + dán cường lực",
  INSTALLMENT: "VD: Trả góp 0% qua Home Credit, trả trước 30%",
  TRADE_IN: "VD: Thu cũ đổi mới trợ giá đến 1.000.000 đ",
  OTHER: "VD: Giảm thêm 5% cho học sinh, sinh viên",
};

/**
 * Các ô của form chương trình khuyến mãi (trong ActionForm). Loại "Giảm giá" có thêm mức giảm;
 * phạm vi chọn theo nhóm (loại hàng / thương hiệu / tình trạng) hoặc từng sản phẩm.
 */
export function PromotionFields({
  promotion,
  today,
  brands,
  branches,
  products,
}: {
  promotion?: PromotionFormValue;
  today: string;
  brands: Option[];
  branches: Option[];
  /** Sản phẩm đang bán để chọn khi áp dụng cho sản phẩm cụ thể */
  products: Option[];
}) {
  const [type, setType] = useState(promotion?.type ?? "DISCOUNT");
  const [discountType, setDiscountType] = useState(promotion?.discountType ?? "PERCENT");
  const [percent, setPercent] = useState(
    promotion?.discountType === "PERCENT" && promotion.discountValue ? String(promotion.discountValue) : "",
  );
  const [amount, setAmount] = useState(
    promotion?.discountType === "AMOUNT" && promotion.discountValue ? String(promotion.discountValue) : "",
  );
  const [maxDiscount, setMaxDiscount] = useState(promotion?.maxDiscount ? String(promotion.maxDiscount) : "");
  const [scope, setScope] = useState(promotion?.productIds.length ? "PRODUCTS" : "GROUP");
  const [picked, setPicked] = useState<number[]>(promotion?.productIds ?? []);
  const [search, setSearch] = useState("");

  const preview =
    type === "DISCOUNT"
      ? discountText({
          discountType,
          discountValue: Number(discountType === "PERCENT" ? percent : amount) || null,
          maxDiscount: discountType === "PERCENT" ? Number(maxDiscount) || null : null,
        })
      : "";
  const productById = new Map(products.map((p) => [p.id, p]));
  const available = products.filter((p) => !picked.includes(p.id));

  return (
    <>
      {promotion && <input type="hidden" name="id" value={promotion.id} />}
      <label className="field sm:col-span-2">
        <span>Tên chương trình *</span>
        <input
          name="title"
          required
          defaultValue={promotion?.title}
          className="input"
          placeholder="VD: Sale 10/10 — Giảm đến 10% phụ kiện"
        />
      </label>

      <label className="field">
        <span>Loại ưu đãi *</span>
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="input">
          {Object.entries(PROMOTION_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Trạng thái</span>
        <select name="active" defaultValue={String(promotion?.active ?? true)} className="input">
          <option value="true">Chạy theo thời gian</option>
          <option value="false">Tạm dừng</option>
        </select>
      </label>

      {type === "DISCOUNT" && (
        <fieldset className="col-span-full grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Mức giảm</legend>
          <label className="field">
            <span>Kiểu giảm</span>
            <select
              name="discountType"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value)}
              className="input"
            >
              <option value="PERCENT">Theo %</option>
              <option value="AMOUNT">Số tiền</option>
            </select>
          </label>
          {discountType === "PERCENT" ? (
            <>
              <label className="field">
                <span>Giảm (%) *</span>
                <input
                  name="discountPercent"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  required
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="input"
                />
              </label>
              <label className="field">
                <span>Giảm tối đa</span>
                <MoneyInput name="maxDiscount" value={maxDiscount} onChange={setMaxDiscount} placeholder="Không giới hạn" />
              </label>
            </>
          ) : (
            <label className="field sm:col-span-2">
              <span>Số tiền giảm *</span>
              <MoneyInput name="discountAmount" required value={amount} onChange={setAmount} />
            </label>
          )}
          <small className="col-span-full text-slate-500">
            {preview && <b className="text-red-600">{preview}. </b>}
            Trừ vào giá bán (giá sale nếu có), làm tròn 1.000 đ. Một sản phẩm thuộc nhiều chương trình giảm giá thì lấy
            mức giảm cao nhất, không cộng dồn. Giá gợi ý ở trang Bán hàng và giá trên web tự cập nhật.
          </small>
        </fieldset>
      )}

      <label className="field col-span-full">
        <span>Nội dung ưu đãi{type !== "DISCOUNT" && " *"}</span>
        <input
          name="summary"
          required={type !== "DISCOUNT"}
          maxLength={200}
          defaultValue={promotion?.summary}
          className="input"
          placeholder={SUMMARY_PLACEHOLDER[type]}
        />
        <small className="text-slate-500">Hiện ở gợi ý sản phẩm khi bán và trên trang sản phẩm của web.</small>
      </label>

      <div className="field">
        <span>Từ ngày *</span>
        <DatePicker name="startDate" required value={promotion?.startDate ?? today} label="Ngày bắt đầu" />
      </div>
      <div className="field">
        <span>Đến hết ngày</span>
        <DatePicker
          name="endDate"
          value={promotion?.endDate ?? ""}
          label="Ngày kết thúc"
          placeholder="Không thời hạn"
          clearable
        />
      </div>

      <fieldset className="field col-span-full">
        <span>Áp dụng cho</span>
        <div className="space-y-3 rounded-md border border-slate-200 p-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                value="GROUP"
                checked={scope === "GROUP"}
                onChange={() => setScope("GROUP")}
                className="size-4"
              />
              Theo loại hàng / thương hiệu
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                value="PRODUCTS"
                checked={scope === "PRODUCTS"}
                onChange={() => setScope("PRODUCTS")}
                className="size-4"
              />
              Chọn sản phẩm cụ thể
            </label>
          </div>

          {scope === "GROUP" ? (
            <>
              <CheckGroup
                label="Loại hàng"
                name="categories"
                options={Object.entries(CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l }))}
                checked={promotion?.categories}
              />
              <CheckGroup
                label="Tình trạng"
                name="conditions"
                options={Object.entries(CONDITION_LABEL).map(([v, l]) => ({ value: v, label: l }))}
                checked={promotion?.conditions}
              />
              {brands.length > 0 && (
                <CheckGroup
                  label="Thương hiệu (phụ kiện, Android)"
                  name="brandIds"
                  options={brands.map((b) => ({ value: String(b.id), label: b.label }))}
                  checked={promotion?.brandIds.map(String)}
                />
              )}
              <small className="block text-slate-500">
                Nhóm nào không tick = không giới hạn. Không tick gì = áp dụng toàn bộ hàng hoá.
              </small>
            </>
          ) : (
            <div className="space-y-2">
              <Autocomplete
                value={search}
                onChange={setSearch}
                onSelect={(o: Option) => {
                  setPicked((p) => [...p, o.id]);
                  setSearch("");
                }}
                options={available}
                getLabel={optionLabel}
                ariaLabel="Thêm sản phẩm áp dụng"
                placeholder="Gõ tên, IMEI hoặc mã để thêm sản phẩm..."
              />
              {picked.map((id) => (
                <input key={id} type="hidden" name="productIds" value={id} />
              ))}
              {picked.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {picked.map((id) => (
                    <li
                      key={id}
                      className="inline-flex max-w-full items-center gap-1 rounded bg-blue-50 py-0.5 pr-1 pl-2 text-sm text-blue-800"
                    >
                      <span className="truncate">{productById.get(id)?.label ?? `Sản phẩm #${id} (đã bán / ngừng bán)`}</span>
                      <button
                        type="button"
                        onClick={() => setPicked((p) => p.filter((x) => x !== id))}
                        aria-label="Bỏ sản phẩm"
                        className="rounded p-0.5 hover:bg-blue-100"
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <small className="block text-slate-500">Chưa chọn sản phẩm nào.</small>
              )}
            </div>
          )}
        </div>
      </fieldset>

      {branches.length > 1 && (
        <fieldset className="field col-span-full">
          <span>Chi nhánh áp dụng</span>
          <div className="rounded-md border border-slate-200 p-3">
            <CheckGroup
              name="branchIds"
              options={branches.map((b) => ({ value: String(b.id), label: b.label }))}
              checked={promotion?.branchIds.map(String)}
            />
          </div>
          <small className="text-slate-500">
            Không tick = mọi chi nhánh. Chương trình riêng chi nhánh vẫn hiện trên web (ghi rõ chi nhánh) nhưng không
            trừ vào giá web.
          </small>
        </fieldset>
      )}

      <fieldset className="col-span-full grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium text-slate-700">Hiển thị trên web</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2 sm:col-span-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="showOnWeb" defaultChecked={promotion?.showOnWeb ?? true} className="size-4" />
            Hiện trên web bán hàng
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="featured" defaultChecked={promotion?.featured} className="size-4" />
            Nổi bật (banner trang chủ)
          </label>
        </div>
        <label className="field sm:col-span-2">
          <span>Link ảnh banner</span>
          <input
            name="bannerUrl"
            type="url"
            defaultValue={promotion?.bannerUrl ?? ""}
            className="input"
            placeholder="https://..."
          />
        </label>
        <label className="field">
          <span>Đường dẫn (slug)</span>
          <input name="slug" defaultValue={promotion?.slug} className="input" placeholder="Tự tạo từ tên" />
        </label>
        <label className="field">
          <span>Thứ tự</span>
          <input
            name="sortOrder"
            type="number"
            inputMode="numeric"
            defaultValue={promotion?.sortOrder ?? 0}
            className="input"
          />
        </label>
        <label className="field sm:col-span-2">
          <span>Thể lệ / chi tiết (Markdown)</span>
          <textarea
            name="content"
            rows={5}
            defaultValue={promotion?.content}
            className="input min-h-28 py-2"
            placeholder={"- Áp dụng khi mua tại cửa hàng hoặc đặt qua Zalo\n- Không áp dụng cùng chương trình khác"}
          />
        </label>
      </fieldset>
    </>
  );
}

function CheckGroup({
  label,
  name,
  options,
  checked = [],
}: {
  label?: string;
  name: string;
  options: { value: string; label: string }[];
  checked?: string[];
}) {
  return (
    <div>
      {label && <p className="mb-1 text-sm text-slate-500">{label}</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2">
            <input type="checkbox" name={name} value={o.value} defaultChecked={checked.includes(o.value)} className="size-4" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
