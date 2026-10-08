import "server-only";
import { prisma } from "./db";
import type { Permission } from "./permissions";

/** Vai trò tạo sẵn lần đầu mở Phân quyền / Nhân viên — admin sửa / xoá / thêm vai trò khác được. */
const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  {
    name: "Bán hàng",
    description: "Nhân viên đứng quầy: vào ca, bán hàng, sửa chữa, bảo hành",
    permissions: ["sell", "products", "repair-prices", "warranty", "timesheet"],
  },
  {
    name: "Kế toán",
    description: "Xem doanh thu, báo cáo lãi lỗ, chi phí, góp vốn, giá nhập — không đứng quầy",
    permissions: ["dashboard", "history", "reports", "capital", "customers", "cost-prices", "installments-manage"],
  },
];

/** Tạo vai trò mặc định khi chưa có vai trò nào (an toàn khi gọi nhiều lần). */
export async function ensureDefaultRoles() {
  if ((await prisma.staffRole.count()) > 0) return;
  await prisma.staffRole.createMany({ data: DEFAULT_ROLES, skipDuplicates: true });
}

/** Vai trò kèm số người đang dùng, sắp theo tên */
export async function getStaffRoles() {
  await ensureDefaultRoles();
  return prisma.staffRole.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
