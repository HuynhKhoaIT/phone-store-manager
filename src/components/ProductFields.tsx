"use client";

import { useState } from "react";
import {
  CATEGORY_LABEL,
  RAM_OPTIONS,
  STATUS_LABEL,
  STORAGE_OPTIONS,
  gbLabel,
  productStatus,
  type ProductStatus,
} from "@/lib/product-labels";
import { MoneyInput } from "./MoneyInput";

type Option = { id: number; name: string };

export type ProductFormValue = {
  category: string;
  name: string;
  brandId: number | null;
  variant: string | null;
  ramGb: number | null;
  storageGb: number | null;
  condition: string;
  code: string | null;
  batteryHealth: number | null;
  costPrice: number | null;
  price: number;
  warrantyMonths: number;
  active: boolean;
  soldBranchId: number | null;
  note: string | null;
  showOnWeb: boolean;
  slug: string | null;
  description: string | null;
  salePrice: number | null;
  priceOnRequest: boolean;
  featured: boolean;
  sortOrder: number;
  imageUrls: string[];
};

/** Các ô của form sản phẩm trong bảng giá (chỉ admin dùng). */
export function ProductFields({
  product,
  defaultCategory,
  branches,
  brands,
}: {
  product?: ProductFormValue;
  defaultCategory: string;
  branches: Option[];
  brands: Option[];
}) {
  const [category, setCategory] = useState(product?.category ?? defaultCategory);
  const [status, setStatus] = useState<ProductStatus>(product ? productStatus(product) : "AVAILABLE");
  const [cost, setCost] = useState(product?.costPrice != null ? String(product.costPrice) : "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [onWeb, setOnWeb] = useState(product?.showOnWeb ?? false);
  const isIphone = category === "IPHONE";
  const isPhone = category !== "ACCESSORY";
  const profit = cost && price ? Number(price) - Number(cost) : null;

  return (
    <>
      <label className="field">
        <span>Loại *</span>
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="input">
          {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Tên sản phẩm *</span>
        <input
          name="name"
          required
          defaultValue={product?.name}
          className="input"
          placeholder={isIphone ? "VD: iPhone 13 Pro Max" : category === "ACCESSORY" ? "VD: Tai nghe Bluetooth" : "VD: Galaxy S23"}
        />
      </label>

      {!isIphone && (
        <label className="field">
          <span>Thương hiệu</span>
          <select name="brandId" defaultValue={product?.brandId ?? ""} className="input">
            <option value="">— Không chọn —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {isPhone && (
        <>
          <label className="field">
            <span>RAM</span>
            <select name="ramGb" defaultValue={product?.ramGb ?? ""} className="input">
              <option value="">— Không ghi —</option>
              {RAM_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}GB
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Bộ nhớ</span>
            <select name="storageGb" defaultValue={product?.storageGb ?? ""} className="input">
              <option value="">— Không ghi —</option>
              {STORAGE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {gbLabel(g)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="field">
        <span>{isPhone ? "Màu sắc" : "Phiên bản / màu"}</span>
        <input
          name="variant"
          defaultValue={product?.variant ?? ""}
          className="input"
          placeholder={isPhone ? "VD: Xanh" : "VD: Trắng, cổng Type-C"}
        />
      </label>
      <label className="field">
        <span>Tình trạng máy</span>
        <select name="condition" defaultValue={product?.condition ?? "NEW"} className="input">
          <option value="NEW">Mới</option>
          <option value="USED">Cũ 99%</option>
        </select>
      </label>

      <label className="field">
        <span>{category === "ACCESSORY" ? "Mã sản phẩm / mã vạch" : "Mã máy (IMEI)"}</span>
        <input
          name="code"
          defaultValue={product?.code ?? ""}
          maxLength={40}
          autoComplete="off"
          className="input tabular-nums"
          placeholder={category === "ACCESSORY" ? "VD: 6953156201234" : "VD: 356789104512345 (bấm *#06#)"}
        />
      </label>
      {isIphone && (
        <>
          <label className="field">
            <span>Tình trạng pin</span>
            <div className="relative">
              <input
                name="batteryHealth"
                type="number"
                min={1}
                max={100}
                defaultValue={product?.batteryHealth ?? ""}
                className="input pr-8"
                placeholder="VD: 88"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
                %
              </span>
            </div>
          </label>
        </>
      )}

      <label className="field">
        <span>Giá nhập</span>
        <MoneyInput name="costPrice" value={cost} onChange={setCost} />
      </label>
      <label className="field">
        <span>Giá bán *</span>
        <MoneyInput name="price" required value={price} onChange={setPrice} />
      </label>
      {profit != null && (
        <p className={`col-span-full -mt-1 text-sm ${profit >= 0 ? "text-green-700" : "text-red-600"}`}>
          Lãi dự kiến: <b className="tabular-nums">{profit.toLocaleString("vi-VN")} đ</b>
          {Number(cost) > 0 && ` (${Math.round((profit / Number(cost)) * 100)}%)`}
        </p>
      )}

      <label className="field">
        <span>Bảo hành mặc định</span>
        <select name="warrantyMonths" defaultValue={product?.warrantyMonths ?? 0} className="input">
          {Array.from({ length: 13 }, (_, m) => (
            <option key={m} value={m}>
              {m === 0 ? "Không bảo hành" : `${m} tháng`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Trạng thái</span>
        <select name="status" value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} className="input">
          {(Object.keys(STATUS_LABEL) as ProductStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {status === "SOLD" && (
        <label className="field">
          <span>Đã bán tại chi nhánh *</span>
          <select name="soldBranchId" required defaultValue={product?.soldBranchId ?? ""} className="input">
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
      )}
      <label className="field sm:col-span-2">
        <span>Ghi chú nội bộ</span>
        <input name="note" defaultValue={product?.note ?? ""} className="input" placeholder="VD: máy zin, đủ hộp (không hiện trên web)" />
      </label>

      {/* ---------- Hiển thị trên web marketing ---------- */}
      <fieldset className="col-span-full rounded-lg border border-slate-200 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="showOnWeb"
            checked={onWeb}
            onChange={(e) => setOnWeb(e.target.checked)}
            className="size-4 accent-[#1677ff]"
          />
          Hiển thị trên web
          <span className="font-normal text-slate-500">(trang bán hàng online)</span>
        </label>
        {onWeb && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span>Giá khuyến mãi</span>
              <MoneyInput name="salePrice" defaultValue={product?.salePrice} />
              <small className="text-slate-500">Để trống nếu không giảm giá. Phải nhỏ hơn giá bán.</small>
            </label>
            <label className="field">
              <span>Đường dẫn (slug)</span>
              <input
                name="slug"
                defaultValue={product?.slug ?? ""}
                maxLength={80}
                className="input"
                placeholder="Để trống: tự tạo từ tên"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={product?.featured ?? false}
                className="size-4 accent-[#1677ff]"
              />
              Sản phẩm nổi bật
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="priceOnRequest"
                defaultChecked={product?.priceOnRequest ?? false}
                className="size-4 accent-[#1677ff]"
              />
              Web hiện &quot;Liên hệ&quot; thay giá
              <span className="text-slate-500">(giá thay đổi theo thị trường)</span>
            </label>
            <label className="field">
              <span>Thứ tự hiển thị</span>
              <input
                name="sortOrder"
                type="number"
                defaultValue={product?.sortOrder ?? 0}
                className="input"
                title="Số nhỏ hiện trước"
              />
            </label>
            <label className="field sm:col-span-2">
              <span>Ảnh (mỗi dòng 1 link, ảnh đầu là ảnh đại diện)</span>
              <textarea
                name="imageUrls"
                rows={3}
                defaultValue={product?.imageUrls.join("\n") ?? ""}
                className="input h-auto py-2"
                placeholder="https://..."
              />
            </label>
            <label className="field sm:col-span-2">
              <span>Mô tả trên web</span>
              <textarea
                name="description"
                rows={4}
                defaultValue={product?.description ?? ""}
                className="input h-auto py-2"
                placeholder="Máy đẹp 99%, zin nguyên bản, tặng ốp + cường lực..."
              />
            </label>
          </div>
        )}
      </fieldset>
    </>
  );
}
