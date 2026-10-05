import { getPublicProducts, preflight, publicHeaders, queryProducts, type ProductQuery } from "@/lib/public-api";

const SORTS = ["featured", "newest", "price_asc", "price_desc"] as const;

function int(v: string | null) {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/**
 * GET /api/public/products
 * ?category=IPHONE|ANDROID|ACCESSORY &brand=Samsung &condition=NEW|USED &q=... &featured=1
 * &minPrice= &maxPrice= &includeSold=1 &sort=featured|newest|price_asc|price_desc &page=1 &pageSize=24
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const sort = sp.get("sort");
  const query: ProductQuery = {
    category: sp.get("category") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    condition: sp.get("condition") ?? undefined,
    q: sp.get("q") ?? undefined,
    featured: sp.get("featured") === "1",
    minPrice: int(sp.get("minPrice")),
    maxPrice: int(sp.get("maxPrice")),
    includeSold: sp.get("includeSold") === "1",
    sort: SORTS.find((s) => s === sort),
    page: int(sp.get("page")),
    pageSize: int(sp.get("pageSize")),
  };
  const result = queryProducts(await getPublicProducts(), query);
  return Response.json(result, { headers: publicHeaders(req.headers.get("origin")) });
}

export const OPTIONS = preflight;
