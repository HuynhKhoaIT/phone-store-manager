import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { formatDate, isValidMonth, KIND_LABEL, PAYMENT_LABEL, todayVN } from "@/lib/format";

type Cell = string | number | null | undefined;

/**
 * Xuất giao dịch / chi phí của một tháng ra file mở bằng Excel.
 * Dùng UTF-16LE + tab (không phải CSV dấu phẩy): Excel tiếng Việt dùng ";" làm dấu phân cách
 * nên CSV dấu phẩy bị dồn một cột; UTF-16 + tab thì Excel nào cũng mở đúng cột và đúng dấu.
 */
function toExcelText(rows: Cell[][]) {
  const text = rows
    .map((r) => r.map((c) => String(c ?? "").replace(/[\t\r\n]+/g, " ")).join("\t"))
    .join("\r\n");
  const body = Buffer.from(text, "utf16le");
  return Buffer.concat([Buffer.from([0xff, 0xfe]), body]); // BOM UTF-16LE
}

export async function GET(req: Request) {
  // Middleware chỉ kiểm tra có cookie — quyền admin phải kiểm tra ở đây
  const me = await getSessionUser();
  if (!me || me.role !== "ADMIN") return new Response("Không có quyền", { status: 403 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type") === "expenses" ? "expenses" : "transactions";
  const m = url.searchParams.get("month") ?? "";
  const month = isValidMonth(m) ? m : todayVN().slice(0, 7);
  const branchId = Number(url.searchParams.get("branch")) || undefined;

  let rows: Cell[][];
  if (type === "transactions") {
    const txs = await prisma.transaction.findMany({
      where: { shift: { date: { startsWith: month }, ...(branchId && { branchId }) } },
      include: { shift: { select: { date: true, staffName: true, branch: { select: { name: true } } } } },
      orderBy: [{ shift: { date: "asc" } }, { createdAt: "asc" }],
    });
    rows = [
      ["Ngày", "Chi nhánh", "Nhân viên", "Loại", "Sản phẩm / Dịch vụ", "Giá bán", "Giá nhập", "Lãi", "Thanh toán",
        "Tài khoản nhận", "Bảo hành (tháng)", "Khách hàng", "SĐT", "Ghi chú"],
      ...txs.map((t) => [
        formatDate(t.shift.date),
        t.shift.branch.name,
        t.shift.staffName,
        KIND_LABEL[t.kind],
        t.productName,
        t.price,
        t.costPrice,
        t.costPrice != null ? t.price - t.costPrice : null,
        PAYMENT_LABEL[t.paymentMethod],
        t.bankAccount,
        t.warrantyMonths || null,
        t.customerName,
        // Dạng ="..." để Excel giữ số 0 đầu của SĐT (không tự đổi thành số)
        t.customerPhone ? `="${t.customerPhone}"` : null,
        t.note,
      ]),
    ];
  } else {
    const expenses = await prisma.expense.findMany({
      where: { date: { startsWith: month }, ...(branchId && { branchId }) },
      include: { branch: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    rows = [
      ["Ngày", "Loại chi phí", "Chi nhánh", "Số tiền", "Ghi chú", "Người nhập"],
      ...expenses.map((e) => [
        formatDate(e.date),
        EXPENSE_CATEGORIES[e.category] ?? e.category,
        e.branch?.name ?? "Chung",
        e.amount,
        e.note,
        e.createdBy,
      ]),
    ];
  }

  const filename = `${type === "transactions" ? "giao-dich" : "chi-phi"}-${month}.csv`;
  return new Response(toExcelText(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-16le",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
