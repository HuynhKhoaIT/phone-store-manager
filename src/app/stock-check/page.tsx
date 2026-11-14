import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { getCurrentBranch } from "@/lib/branch";
import { isLowStock } from "@/lib/low-stock";
import { getAppSettings } from "@/lib/settings";
import { isSingleUnit, productPickLabel } from "@/lib/product-labels";
import { formatDateLong, formatTimeVN, todayVN } from "@/lib/format";
import { saveLowStockThreshold } from "../actions";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/PageHeader";
import { StockCheckList } from "@/components/StockCheckList";

/**
 * Kiểm tra hàng hoá: nhân viên so hàng hoá thực tế ở cửa hàng với bảng giá (hàng của chi nhánh đang làm) rồi
 * chọn Đủ / Thiếu cho từng sản phẩm — xem src/lib/low-stock.ts, StockCheckItem (prisma/schema.prisma).
 */
export default async function StockCheckPage() {
  const me = await requirePermission("products");
  const branch = await getCurrentBranch();
  if (!branch) redirect("/choose-branch");
  const today = todayVN();

  const [settings, products, checks] = await Promise.all([
    getAppSettings(),
    // Hàng đang bán của chi nhánh (hàng cũ chưa gắn chi nhánh thì hiện ở mọi quán, giống trang Hàng hoá)
    prisma.product.findMany({
      where: { active: true, soldBranchId: null, OR: [{ ownerBranchId: branch.id }, { ownerBranchId: null }] },
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        category: true,
        name: true,
        variant: true,
        condition: true,
        ramGb: true,
        storageGb: true,
        code: true,
        quantity: true,
      },
    }),
    prisma.stockCheckItem.findMany({
      where: { date: today, branchId: branch.id },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const byProduct = new Map(checks.map((c) => [c.productId, c]));
  const items = products.map((p) => {
    const check = byProduct.get(p.id);
    return {
      productId: p.id,
      label: productPickLabel(p),
      category: p.category,
      quantity: isSingleUnit(p) ? null : p.quantity,
      isLow: isLowStock(p, settings.lowStockThreshold),
      status: check ? (check.status as "OK" | "SHORT") : null,
      checkedBy: check ? (check.user.id === me.id ? "Bạn" : check.user.name) : null,
      checkedAt: check ? formatTimeVN(check.checkedAt) : null,
      canEdit: !check || check.user.id === me.id || me.role === "ADMIN",
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Kiểm tra hàng hoá" subtitle={`${branch.name} · ${formatDateLong(today)}`} />

      {items.length === 0 ? (
        <p className="card text-center text-slate-500">Chi nhánh chưa có hàng hoá nào trong bảng giá.</p>
      ) : (
        <StockCheckList date={today} items={items} />
      )}

      {me.role === "ADMIN" && (
        <div className="card">
          <h2 className="mb-1 font-semibold">Ngưỡng cảnh báo sắp hết hàng</h2>
          <p className="mb-3 text-sm text-slate-500">
            Hàng đếm được (phụ kiện, Android không IMEI) còn bằng hoặc ít hơn số này sẽ có nhãn &quot;Sắp hết&quot; ở
            trên. Để 0 thì chỉ gắn nhãn khi hệ thống ghi hàng đã hết.
          </p>
          <ActionForm
            action={saveLowStockThreshold}
            submitLabel="Lưu"
            submitAlign="start"
            successMessage="Đã lưu ngưỡng cảnh báo."
            className="flex flex-wrap items-end gap-3"
          >
            <label className="field w-32">
              <span>Còn tối đa</span>
              <input
                name="lowStockThreshold"
                type="number"
                min={0}
                required
                defaultValue={settings.lowStockThreshold}
                className="input tabular-nums"
              />
            </label>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
