import { addDays } from "./format";

/**
 * Việc của chủ quán (admin) — cố định trong code, không cần thiết lập ở trang Checklist.
 * Sửa / thêm việc: sửa trực tiếp danh sách dưới. `key` lưu vào DB (AdminCheck) nên đừng đổi key của việc cũ.
 * Việc tuần / tháng hiện mỗi ngày cho đến khi tick trong tuần / tháng đó.
 */
export type AdminTaskPeriod = "day" | "week" | "month";

export type AdminTask = {
  key: string;
  period: AdminTaskPeriod;
  title: string;
  description: string;
  /** Trang để làm việc này (bỏ trống nếu làm ngay trên trang Bán hàng) */
  href?: string;
};

export const ADMIN_TASKS: AdminTask[] = [
  // Hằng ngày
  {
    key: "check-shifts",
    period: "day",
    title: "Kiểm tra chốt ca các chi nhánh",
    description: "Ca nào chưa chốt, tiền mặt bàn giao có bị lệch không.",
  },
  {
    key: "reconcile-transfer",
    period: "day",
    title: "Đối chiếu chuyển khoản",
    description: "So tổng CK từng tài khoản với sao kê ngân hàng.",
  },
  {
    key: "fix-transactions",
    period: "day",
    title: "Xử lý giao dịch nhập sai",
    description: "Nhân viên báo sai thì xoá giao dịch / mở lại ca để sửa.",
  },
  {
    key: "import-goods",
    period: "day",
    title: "Ghi phiếu nhập hàng về",
    description: "Nhập kèm giá nhập để Dashboard tính được lợi nhuận.",
    href: "/products/receipts",
  },
  {
    key: "update-products",
    period: "day",
    title: "Cập nhật hàng hoá lên web",
    description: "Máy mới: IMEI, ảnh, bật Hiện trên web. Chỉnh giá theo thị trường.",
    href: "/products",
  },
  // Hằng tuần
  {
    key: "write-post",
    period: "week",
    title: "Đăng bài tin tức",
    description: "1–2 bài: máy mới về, khuyến mãi, mẹo hay.",
    href: "/posts",
  },
  {
    key: "review-stock",
    period: "week",
    title: "Rà hàng tồn lâu",
    description: "Giảm giá máy bán chậm; máy đã bán / hết thì đánh dấu để web không hiện.",
    href: "/products",
  },
  {
    key: "review-repair-prices",
    period: "week",
    title: "Kiểm tra bảng giá sửa chữa",
    description: "Cập nhật theo giá linh kiện mới.",
    href: "/repair-prices",
  },
  // Hằng tháng
  {
    key: "monthly-report",
    period: "month",
    title: "Xem doanh thu, lợi nhuận tháng",
    description: "So với tháng trước, theo chi nhánh / nhân viên, top sản phẩm.",
    href: "/dashboard",
  },
  {
    key: "monthly-history",
    period: "month",
    title: "Xử lý ngày lệch tiền, ca chưa chốt",
    description: "Xem lịch tháng của từng chi nhánh.",
    href: "/history",
  },
  {
    key: "payroll",
    period: "month",
    title: "Tính lương theo chấm công",
    description: "Tổng giờ làm của từng nhân viên.",
    href: "/timesheet",
  },
  {
    key: "stock-take",
    period: "month",
    title: "Kiểm kê hàng thực tế",
    description: "Đối chiếu IMEI máy với danh sách Đang bán, đếm phụ kiện.",
    href: "/products",
  },
  {
    key: "review-accounts",
    period: "month",
    title: "Rà tài khoản nhân viên",
    description: "Khoá tài khoản người đã nghỉ, cập nhật chi nhánh / quyền.",
    href: "/users",
  },
];

export const ADMIN_PERIOD_LABELS: Record<AdminTaskPeriod, string> = {
  day: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
};

/** Mã kỳ của một ngày: ngày (YYYY-MM-DD), thứ Hai đầu tuần (W:YYYY-MM-DD) hoặc tháng (YYYY-MM). */
export function periodKey(period: AdminTaskPeriod, date: string) {
  if (period === "month") return date.slice(0, 7);
  if (period === "week") {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Chủ nhật
    return `W:${addDays(date, -((weekday + 6) % 7))}`;
  }
  return date;
}
