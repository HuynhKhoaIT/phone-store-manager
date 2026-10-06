import "server-only";
import type { Prisma, Product } from "@prisma/client";
import { productLabel } from "./product-labels";

type Db = Prisma.TransactionClient;

/**
 * Mặt hàng tương ứng ở một chi nhánh (mỗi quán quản lý nguồn hàng riêng: cùng một phụ kiện ở 2 quán là 2 dòng).
 * - Hàng chưa gắn chi nhánh hoặc đúng chi nhánh đó → chính nó.
 * - Không thì tìm dòng cùng loại / tên / cấu hình / mã ở chi nhánh kia; `create` thì tạo bản sao (SL 0) nếu chưa có.
 */
export async function branchTwin(db: Db, product: Product, branchId: number, create: boolean): Promise<Product | null> {
  if (product.ownerBranchId == null || product.ownerBranchId === branchId) return product;
  const same = {
    category: product.category,
    name: product.name,
    variant: product.variant,
    condition: product.condition,
    ramGb: product.ramGb,
    storageGb: product.storageGb,
    brandId: product.brandId,
    code: product.code,
  };
  const twin = await db.product.findFirst({ where: { ...same, ownerBranchId: branchId }, orderBy: { id: "asc" } });
  if (twin || !create) return twin;
  return db.product.create({
    data: {
      ...same,
      price: product.price,
      costPrice: product.costPrice,
      warrantyMonths: product.warrantyMonths,
      batteryHealth: product.batteryHealth,
      note: product.note,
      ownerBranchId: branchId,
      quantity: 0,
    },
  });
}

/** Cộng / trừ số lượng (có thể âm khi số liệu chưa khớp — không chặn bán hàng). */
export function adjustQty(db: Db, productId: number, delta: number) {
  return db.product.update({ where: { id: productId }, data: { quantity: { increment: delta } } });
}

/**
 * Quán `borrowerBranchId` đã bán / tặng `qty` món hàng của quán khác → ghi sổ Mượn hàng (nợ giá nhập).
 * Dùng trước các dòng "đang mượn" đã ghi (tách dòng nếu chỉ dùng một phần), phần còn thiếu thì tạo dòng mới.
 */
export async function consumeBorrowed(
  db: Db,
  args: { product: Product; qty: number; borrowerBranchId: number; date: string; transactionId: number; createdBy: string; note: string },
) {
  const { product, borrowerBranchId, date, transactionId, createdBy } = args;
  if (product.ownerBranchId == null || product.ownerBranchId === borrowerBranchId) return;
  const cost = product.costPrice ?? 0;
  const sold = { status: "SOLD", transactionId, soldDate: date };
  let remaining = args.qty;

  const open = await db.branchLoan.findMany({
    where: { productId: product.id, borrowerBranchId, status: "BORROWED" },
    orderBy: { id: "asc" },
  });
  for (const loan of open) {
    if (remaining <= 0) break;
    const take = Math.min(loan.quantity, remaining);
    if (take === loan.quantity) {
      await db.branchLoan.update({ where: { id: loan.id }, data: { ...sold, amount: cost * take } });
    } else {
      // Mượn 5 bán 2: dòng cũ còn 3 đang mượn, tách 2 thành dòng "đã bán"
      await db.branchLoan.update({ where: { id: loan.id }, data: { quantity: loan.quantity - take, amount: cost * (loan.quantity - take) } });
      await db.branchLoan.create({
        data: {
          ...sold,
          productId: product.id,
          productName: loan.productName,
          quantity: take,
          amount: cost * take,
          lenderBranchId: loan.lenderBranchId,
          borrowerBranchId,
          date: loan.date,
          note: loan.note,
          createdBy: loan.createdBy,
        },
      });
    }
    remaining -= take;
  }
  if (remaining > 0)
    await db.branchLoan.create({
      data: {
        ...sold,
        productId: product.id,
        productName: productLabel(product),
        quantity: remaining,
        amount: cost * remaining,
        lenderBranchId: product.ownerBranchId,
        borrowerBranchId,
        date,
        note: args.note,
        createdBy,
      },
    });
}
