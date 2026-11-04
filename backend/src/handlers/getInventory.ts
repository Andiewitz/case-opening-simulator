import { json, preflight, requireAuth, logFailure } from "../shared/utils";
import { listInventory } from "../shared/inventory";

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

/**
 * GET /users/{userId}/inventory?limit=&cursor=
 *
 * Returns `{ items, nextCursor }`. The previous shape (a bare array) came from
 * a single Query call, which DynamoDB caps at 1 MB — a large collection was
 * silently truncated with no way for the client to notice or continue.
 */
export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return preflight(event);

  const auth = await requireAuth(event.headers);
  if ("statusCode" in auth) return json(event, auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  const query = event.queryStringParameters || {};
  const requested = Number(query.limit);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const cursor = typeof query.cursor === "string" && query.cursor ? query.cursor : null;

  try {
    const page = await listInventory(userId, limit, cursor);
    const items = page.items.sort(
      (a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || "")
    );
    return json(event, 200, { items, nextCursor: page.nextCursor ?? null });
  } catch (error: any) {
    logFailure(event, "get_inventory_failed", error, { userId });
    return json(event, 500, { error: "Get inventory failed" });
  }
};
