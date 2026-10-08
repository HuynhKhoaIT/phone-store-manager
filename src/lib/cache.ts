/**
 * Tag cho Next.js Data Cache. Dữ liệu ít thay đổi (chi nhánh, tài khoản, bảng giá) được cache
 * giữa các request để giảm số lần gọi DB; server action sửa dữ liệu nào thì gọi revalidateTag tag đó.
 */
export const TAGS = {
  branches: "branches",
  users: "users",
  prices: "prices",
  posts: "posts",
  promotions: "promotions",
} as const;

/**
 * Lưới an toàn: cache tự làm mới sau 5 phút, phòng khi dữ liệu bị sửa ngoài app
 * (Prisma Studio, script seed...) mà không gọi revalidateTag.
 */
export const CACHE_SECONDS = 300;
