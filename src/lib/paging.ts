/** Số dòng mỗi trang của mọi bảng / danh sách. */
export const PAGE_SIZE = 20;

export type Paging = {
  page: number;
  pageCount: number;
  total: number;
  /** Số dòng cần lấy từ đầu danh sách (skip 0): điện thoại hiện cộng dồn trang 1..page */
  take: number;
  /** Chỉ số dòng đầu tiên của trang hiện tại — máy tính chỉ hiện từ dòng này */
  start: number;
};

/**
 * Phân trang dùng chung, cùng một tham số `?page=`:
 * - Máy tính: hiện đúng 20 dòng của trang đó, chuyển trang bằng dãy số.
 * - Điện thoại: hiện cộng dồn từ dòng đầu tới hết trang đó, bấm "Xem thêm" để tải tiếp
 *   (giữ nguyên vị trí cuộn). Dòng của các trang trước được render nhưng ẩn trên máy tính (`rowClass`).
 *
 * Dữ liệu từ DB: đếm `total` trước, rồi `findMany({ take: paging.take })` (không skip).
 * Dữ liệu trong bộ nhớ: `items.slice(0, paging.take)`.
 */
export function getPaging(total: number, rawPage?: string): Paging {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(Number(rawPage)) || 1), pageCount);
  return { page, pageCount, total, take: page * PAGE_SIZE, start: (page - 1) * PAGE_SIZE };
}

/** Class cho dòng thứ `index` (tính từ 0 trong danh sách đã `take`): dòng của trang trước ẩn trên máy tính. */
export function rowClass(paging: Paging, index: number) {
  return index < paging.start ? "sm:hidden" : "";
}

/** Tạo href giữ nguyên query hiện tại, chỉ đổi `page` (trang 1 thì bỏ tham số). */
export function pageHref(path: string, params: Record<string, string | number | undefined | null>) {
  return (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && k !== "page") p.set(k, String(v));
    if (page > 1) p.set("page", String(page));
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };
}
