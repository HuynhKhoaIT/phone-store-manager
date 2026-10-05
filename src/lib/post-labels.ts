/** Nhãn bài viết — dùng được cả ở client. */

export const POST_CATEGORY_LABEL: Record<string, string> = {
  NEWS: "Tin tức",
  PROMOTION: "Khuyến mãi",
  GUIDE: "Mẹo hay",
};

export type PostDisplayStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED";

export const POST_STATUS_LABEL: Record<PostDisplayStatus, string> = {
  DRAFT: "Nháp",
  SCHEDULED: "Hẹn giờ",
  PUBLISHED: "Đã đăng",
};

/** Trạng thái hiển thị: đã đăng nhưng ngày đăng ở tương lai = hẹn giờ */
export function postDisplayStatus(p: { status: string; publishedAt: Date | string | null }, now = new Date()) {
  if (p.status !== "PUBLISHED") return "DRAFT" as const;
  return p.publishedAt && new Date(p.publishedAt) > now ? ("SCHEDULED" as const) : ("PUBLISHED" as const);
}
