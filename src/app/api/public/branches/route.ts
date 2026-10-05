import { getActiveBranches } from "@/lib/branch";
import { preflight, publicHeaders } from "@/lib/public-api";

/** GET /api/public/branches — chi nhánh đang hoạt động (id, tên), sắp theo id. */
export async function GET(req: Request) {
  const items = (await getActiveBranches()).map((b) => ({ id: b.id, name: b.name }));
  return Response.json({ items }, { headers: publicHeaders(req.headers.get("origin")) });
}

export const OPTIONS = preflight;
