/**
 * Tag cho Next.js Data Cache. Dữ liệu ít thay đổi (chi nhánh, tài khoản, bảng giá) được cache
 * giữa các request để giảm số lần gọi DB; server action sửa dữ liệu nào thì gọi revalidateTag tag đó.
 */
export const TAGS = {
  branches: "branches",
  users: "users",
  prices: "prices",
} as const;
