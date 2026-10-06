import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CACHE_SECONDS, TAGS } from "./cache";
import { CATEGORY_LABEL, CONDITION_LABEL, capacityLabel } from "./product-labels";
import { POST_CATEGORY_LABEL } from "./post-labels";
import { markdownToPlainText, renderMarkdown } from "./markdown";

/**
 * API công khai cho web marketing. CHỈ trả dữ liệu an toàn:
 * KHÔNG có giá nhập, ghi chú nội bộ, chi nhánh đã bán, IMEI đầy đủ.
 */
export type PublicProduct = {
  id: number;
  slug: string;
  /** Tên dòng máy, vd "iPhone 13 Pro Max" */
  name: string;
  /** Tên đầy đủ, vd "iPhone 13 Pro Max 6/128GB Xanh (Cũ)" */
  title: string;
  category: string;
  categoryLabel: string;
  brand: string | null;
  condition: "NEW" | "USED";
  conditionLabel: string;
  ramGb: number | null;
  storageGb: number | null;
  /** "6/128GB" */
  capacity: string | null;
  color: string | null;
  batteryHealth: number | null;
  warrantyMonths: number;
  /** Giá niêm yết */
  price: number;
  /** Giá khuyến mãi (nếu có) */
  salePrice: number | null;
  /** Giá thực bán = salePrice ?? price */
  finalPrice: number;
  /** % giảm, làm tròn */
  discountPercent: number;
  status: "AVAILABLE" | "SOLD";
  featured: boolean;
  sortOrder: number;
  images: string[];
  thumbnail: string | null;
  description: string | null;
  /** IMEI đã che, vd "3567•••••••2345" (chỉ điện thoại) */
  imeiMasked: string | null;
  updatedAt: string;
};

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows() {
  return prisma.product.findMany({
    // Chỉ sản phẩm bật "hiển thị trên web" và chưa ngừng bán
    where: { showOnWeb: true, active: true, slug: { not: null } },
    include: { brand: { select: { name: true, active: true } } },
  });
}

function maskCode(code: string) {
  if (code.length <= 8) return "•".repeat(code.length);
  return code.slice(0, 4) + "•".repeat(code.length - 8) + code.slice(-4);
}

function toPublic(p: Row): PublicProduct {
  // Giá liên hệ: không lộ giá nội bộ ra web, trả 0 cho mọi trường giá (FE hiện "Liên hệ")
  const price = p.priceOnRequest ? 0 : p.price;
  const finalPrice = p.priceOnRequest ? 0 : p.salePrice != null && p.salePrice < p.price ? p.salePrice : p.price;
  const capacity = capacityLabel(p);
  return {
    id: p.id,
    slug: p.slug!,
    name: p.name,
    title: [p.name, capacity, p.variant, p.condition === "USED" ? "(Cũ)" : null].filter(Boolean).join(" "),
    category: p.category,
    categoryLabel: CATEGORY_LABEL[p.category] ?? p.category,
    brand: p.category === "IPHONE" ? "Apple" : p.brand?.active ? p.brand.name : null,
    condition: p.condition === "USED" ? "USED" : "NEW",
    conditionLabel: CONDITION_LABEL[p.condition] ?? p.condition,
    ramGb: p.ramGb,
    storageGb: p.storageGb,
    capacity,
    color: p.variant,
    batteryHealth: p.batteryHealth,
    warrantyMonths: p.warrantyMonths,
    price,
    salePrice: finalPrice < price ? finalPrice : null,
    finalPrice,
    discountPercent: finalPrice < price ? Math.round(((price - finalPrice) / price) * 100) : 0,
    status: p.soldBranchId != null ? "SOLD" : "AVAILABLE",
    featured: p.featured,
    sortOrder: p.sortOrder,
    images: p.imageUrls,
    thumbnail: p.imageUrls[0] ?? null,
    description: p.description,
    imeiMasked: p.code && p.category !== "ACCESSORY" ? maskCode(p.code) : null,
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Toàn bộ sản phẩm công khai (cache; xoá cache khi sửa bảng giá / bán máy — tag "prices"). */
export const getPublicProducts = unstable_cache(async () => (await loadRows()).map(toPublic), ["public-products"], {
  tags: [TAGS.prices], revalidate: CACHE_SECONDS,
});

export type ProductQuery = {
  category?: string;
  brand?: string;
  condition?: string;
  q?: string;
  featured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  includeSold?: boolean;
  sort?: "featured" | "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}

/** Lọc / sắp xếp / phân trang (dữ liệu một cửa hàng nhỏ → lọc trong bộ nhớ). */
export function queryProducts(all: PublicProduct[], q: ProductQuery) {
  const term = q.q ? normalize(q.q.trim()) : "";
  let items = all.filter(
    (p) =>
      (q.includeSold || p.status === "AVAILABLE") &&
      (!q.category || p.category === q.category) &&
      (!q.brand || (p.brand && normalize(p.brand) === normalize(q.brand))) &&
      (!q.condition || p.condition === q.condition) &&
      (!q.featured || p.featured) &&
      (q.minPrice == null || p.finalPrice >= q.minPrice) &&
      (q.maxPrice == null || p.finalPrice <= q.maxPrice) &&
      (!term || normalize(`${p.title} ${p.brand ?? ""}`).includes(term)),
  );

  const byDate = (a: PublicProduct, b: PublicProduct) => b.updatedAt.localeCompare(a.updatedAt);
  const sorters: Record<string, (a: PublicProduct, b: PublicProduct) => number> = {
    featured: (a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder || byDate(a, b),
    newest: byDate,
    price_asc: (a, b) => a.finalPrice - b.finalPrice,
    price_desc: (a, b) => b.finalPrice - a.finalPrice,
  };
  items = [...items].sort(sorters[q.sort ?? "featured"] ?? sorters.featured);

  const pageSize = Math.min(Math.max(q.pageSize ?? 24, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(items.length / pageSize), 1),
  };
}

/** Dữ liệu cho bộ lọc trên web: loại hàng, thương hiệu, khoảng giá (chỉ hàng đang bán). */
export function buildFilters(all: PublicProduct[]) {
  const available = all.filter((p) => p.status === "AVAILABLE");
  const count = (key: (p: PublicProduct) => string | null) => {
    const m = new Map<string, number>();
    for (const p of available) {
      const k = key(p);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const prices = available.map((p) => p.finalPrice).filter((n) => n > 0); // bỏ giá liên hệ
  return {
    categories: [...count((p) => p.category)].map(([value, total]) => ({
      value,
      label: CATEGORY_LABEL[value] ?? value,
      total,
    })),
    brands: [...count((p) => p.brand)].map(([name, total]) => ({ name, total })).sort((a, b) => a.name.localeCompare(b.name)),
    conditions: [...count((p) => p.condition)].map(([value, total]) => ({
      value,
      label: CONDITION_LABEL[value] ?? value,
      total,
    })),
    priceRange: { min: prices.length ? Math.min(...prices) : 0, max: prices.length ? Math.max(...prices) : 0 },
    total: available.length,
  };
}

/** Bảng giá sửa chữa công khai — KHÔNG trả ghi chú nội bộ (cache tag "prices"). */
export const getPublicRepairPrices = unstable_cache(
  async () =>
    prisma.repairPrice.findMany({
      select: { service: true, device: true, price: true, warranty: true },
      orderBy: [{ service: "asc" }, { device: "asc" }],
    }),
  ["public-repair-prices"],
  { tags: [TAGS.prices], revalidate: CACHE_SECONDS },
);

/* ---------------- Tin tức ---------------- */

export type PublicPostSummary = {
  id: number;
  slug: string;
  title: string;
  category: string;
  categoryLabel: string;
  excerpt: string;
  coverImageUrl: string | null;
  featured: boolean;
  author: string | null;
  /** Số phút đọc ước tính */
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
};

export type PublicPost = PublicPostSummary & {
  /** Nội dung Markdown gốc */
  content: string;
  /** HTML đã làm sạch (không có HTML viết tay / link javascript:) — FE chèn trực tiếp được */
  contentHtml: string;
};

/**
 * Bài đã đăng (gồm cả bài hẹn giờ — lọc theo thời điểm lúc gọi API để bài hẹn giờ tự hiện).
 * Cache tag "posts".
 */
const getPublishedPosts = unstable_cache(
  async (): Promise<PublicPost[]> => {
    const rows = await prisma.post.findMany({
      where: { status: "PUBLISHED" },
      include: { author: { select: { name: true } } },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    });
    return rows.map((p) => {
      const plain = markdownToPlainText(p.content);
      const words = plain ? plain.split(/\s+/).length : 0;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        category: p.category,
        categoryLabel: POST_CATEGORY_LABEL[p.category] ?? p.category,
        excerpt: p.excerpt || (plain.length > 180 ? `${plain.slice(0, 177).trimEnd()}…` : plain),
        coverImageUrl: p.coverImageUrl,
        featured: p.featured,
        author: p.author?.name ?? null,
        readingMinutes: Math.max(1, Math.round(words / 200)),
        publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        content: p.content,
        contentHtml: renderMarkdown(p.content),
      };
    });
  },
  ["public-posts"],
  { tags: [TAGS.posts], revalidate: CACHE_SECONDS },
);

/** Bài đã tới giờ đăng */
export async function getVisiblePosts() {
  const now = new Date().toISOString();
  return (await getPublishedPosts()).filter((p) => p.publishedAt <= now);
}

export function toSummary({ content: _content, contentHtml: _html, ...rest }: PublicPost): PublicPostSummary {
  return rest;
}

export type PostQuery = { category?: string; q?: string; featured?: boolean; page?: number; pageSize?: number };

export function queryPosts(all: PublicPost[], q: PostQuery) {
  const term = q.q ? normalize(q.q.trim()) : "";
  const items = all.filter(
    (p) =>
      (!q.category || p.category === q.category) &&
      (!q.featured || p.featured) &&
      (!term || normalize(`${p.title} ${p.excerpt}`).includes(term)),
  );
  const pageSize = Math.min(Math.max(q.pageSize ?? 12, 1), 50);
  const page = Math.max(q.page ?? 1, 1);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize).map(toSummary),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(items.length / pageSize), 1),
  };
}

/* ---------------- CORS + cache cho route handler ---------------- */

/**
 * Domain được gọi API, cấu hình bằng env PUBLIC_API_ORIGINS (cách nhau dấu phẩy),
 * vd "https://shop.example.com,http://localhost:3001". Không đặt = cho phép mọi domain (dữ liệu chỉ đọc, công khai).
 */
export function publicHeaders(origin: string | null): HeadersInit {
  const allowed = (process.env.PUBLIC_API_ORIGINS ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
    // CDN cache 60s, cho phép dùng bản cũ thêm 5 phút trong lúc làm mới
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  };
}

export function preflight(req: Request) {
  return new Response(null, { status: 204, headers: publicHeaders(req.headers.get("origin")) });
}
