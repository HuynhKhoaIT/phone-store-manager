import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { CACHE_SECONDS, TAGS } from "./cache";
import { CATEGORY_LABEL, CONDITION_LABEL, capacityLabel } from "./product-labels";
import { POST_CATEGORY_LABEL } from "./post-labels";
import { markdownToPlainText, renderMarkdown } from "./markdown";
import { getBranches } from "./branch";
import { todayVN } from "./format";
import { getPromotionRows, type PromotionRow } from "./promotions";
import { PROMOTION_TYPE_LABEL, discountText, matchesPromotion, promotionStatus, promotionsFor } from "./promotion-labels";

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
  /** Chương trình khuyến mãi đang chạy áp dụng cho sản phẩm (giảm giá đã tính vào salePrice / finalPrice) */
  promotions: PublicPromotionBadge[];
  updatedAt: string;
};

/** Khuyến mãi gắn trên một sản phẩm */
export type PublicPromotionBadge = {
  slug: string;
  title: string;
  type: string;
  typeLabel: string;
  /** Nội dung ưu đãi, vd "Giảm 10% (tối đa 500.000 đ)", "Tặng ốp lưng + cường lực" */
  summary: string;
  /** Số tiền được giảm trên sản phẩm này (đã trừ vào finalPrice); 0 = không trừ giá */
  discountAmount: number;
  /** YYYY-MM-DD (hết ngày này); null = không thời hạn */
  endDate: string | null;
  /** Chỉ áp dụng tại các chi nhánh này; [] = mọi chi nhánh */
  branches: string[];
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
    promotions: [],
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Sản phẩm công khai chưa tính khuyến mãi + brandId để khớp chương trình (cache; tag "prices"). */
const getBaseProducts = unstable_cache(
  async () => (await loadRows()).map((p) => ({ product: toPublic(p), brandId: p.brandId })),
  ["public-products"],
  { tags: [TAGS.prices], revalidate: CACHE_SECONDS },
);

/** Chương trình đang chạy, bật hiện trên web (lọc theo ngày lúc gọi API → tự bắt đầu / kết thúc đúng ngày). */
async function getWebPromotions() {
  const today = todayVN();
  return (await getPromotionRows()).filter((p) => p.showOnWeb && promotionStatus(p, today) === "RUNNING");
}

const matchKey = (p: PublicProduct, brandId: number | null) => ({
  id: p.id,
  category: p.category,
  brandId,
  condition: p.condition,
});

/**
 * Toàn bộ sản phẩm công khai, giá đã trừ khuyến mãi giảm giá (mức cao nhất, không cộng dồn). Chỉ chương trình áp dụng
 * mọi chi nhánh mới trừ vào giá web — chương trình riêng chi nhánh chỉ hiện thông tin.
 */
export async function getPublicProducts(): Promise<PublicProduct[]> {
  const [base, promos, branches] = await Promise.all([getBaseProducts(), getWebPromotions(), getBranches()]);
  if (!promos.length) return base.map((b) => b.product);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  return base.map(({ product: p, brandId }) => {
    const key = matchKey(p, brandId);
    const matched = promos.filter((x) => matchesPromotion(x, key));
    if (!matched.length) return p;
    // Giá liên hệ (finalPrice 0) thì promotionDiscount trả 0 — chỉ hiện ưu đãi
    const { best } = promotionsFor(matched.filter((x) => !x.branchIds.length), key, p.finalPrice);
    const finalPrice = p.finalPrice - (best?.amount ?? 0);
    return {
      ...p,
      salePrice: finalPrice < p.price ? finalPrice : null,
      finalPrice,
      discountPercent: finalPrice < p.price ? Math.round(((p.price - finalPrice) / p.price) * 100) : 0,
      promotions: matched.map((x) => ({
        slug: x.slug,
        title: x.title,
        type: x.type,
        typeLabel: PROMOTION_TYPE_LABEL[x.type] ?? x.type,
        summary: x.type === "DISCOUNT" ? discountText(x) : x.summary,
        discountAmount: x === best?.promo ? best.amount : 0,
        endDate: x.endDate,
        branches: x.branchIds.map((id) => branchName.get(id)).filter((n): n is string => !!n),
      })),
    };
  });
}

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

/* ---------------- Khuyến mãi ---------------- */

export type PublicPromotionSummary = {
  id: number;
  slug: string;
  title: string;
  type: string;
  typeLabel: string;
  summary: string;
  bannerUrl: string | null;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD (hết ngày này); null = không thời hạn */
  endDate: string | null;
  status: "RUNNING" | "UPCOMING" | "ENDED";
  featured: boolean;
  /** Chỉ áp dụng tại các chi nhánh này; [] = mọi chi nhánh */
  branches: string[];
  /** Số sản phẩm còn hàng trên web được áp dụng */
  productCount: number;
};

export type PublicPromotion = PublicPromotionSummary & {
  /** Thể lệ — Markdown gốc */
  content: string;
  /** HTML đã làm sạch — FE chèn trực tiếp được */
  contentHtml: string;
};

async function toPromotionSummaries(rows: PromotionRow[]) {
  const [base, branches] = await Promise.all([getBaseProducts(), getBranches()]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  const today = todayVN();
  const available = base.filter((b) => b.product.status === "AVAILABLE");
  return rows.map(
    (p): PublicPromotionSummary => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      type: p.type,
      typeLabel: PROMOTION_TYPE_LABEL[p.type] ?? p.type,
      summary: p.type === "DISCOUNT" ? discountText(p) : p.summary,
      bannerUrl: p.bannerUrl,
      startDate: p.startDate,
      endDate: p.endDate,
      // Hàng đã lọc active nên không có PAUSED
      status: promotionStatus(p, today) as PublicPromotionSummary["status"],
      featured: p.featured,
      branches: p.branchIds.map((id) => branchName.get(id)).filter((n): n is string => !!n),
      productCount: available.filter((b) => matchesPromotion(p, matchKey(b.product, b.brandId))).length,
    }),
  );
}

/** Chương trình đang chạy (+ sắp diễn ra nếu `includeUpcoming`) bật hiện trên web — thứ tự: nổi bật → thứ tự → mới nhất. */
export async function getPublicPromotions(includeUpcoming = false) {
  const today = todayVN();
  const rows = (await getPromotionRows()).filter((p) => {
    const st = promotionStatus(p, today);
    return p.showOnWeb && (st === "RUNNING" || (includeUpcoming && st === "UPCOMING"));
  });
  return toPromotionSummaries(rows);
}

/** Chi tiết theo slug (kể cả đã kết thúc để link cũ không lỗi) + sản phẩm còn hàng được áp dụng (khi đang chạy). */
export async function getPublicPromotion(slug: string) {
  const row = (await getPromotionRows()).find((p) => p.showOnWeb && p.slug === slug);
  if (!row) return null;
  const [[summary], products] = await Promise.all([toPromotionSummaries([row]), getPublicProducts()]);
  const promotion: PublicPromotion = { ...summary, content: row.content, contentHtml: renderMarkdown(row.content) };
  const items =
    summary.status === "RUNNING"
      ? products.filter((p) => p.status === "AVAILABLE" && p.promotions.some((x) => x.slug === row.slug))
      : [];
  return { promotion, products: items };
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
