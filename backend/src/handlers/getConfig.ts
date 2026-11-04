import { preflight } from "../shared/utils";
import { CASE_COST, MAX_INVENTORY_ITEMS, STARTING_BALANCE } from "../config";

const CACHE = "public, max-age=300, stale-while-revalidate=3600";

/**
 * GET /config — public economy settings.
 *
 * Exists so the case price lives in exactly one place (backend/src/config.ts)
 * instead of being re-typed in the storefront and the case page. See
 * docs/plan.md F9.
 */
export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return preflight(event);

  return {
    statusCode: 200,
    headers: { ...preflight(event).headers, "Cache-Control": CACHE },
    body: JSON.stringify({
      caseCost: CASE_COST,
      startingBalance: STARTING_BALANCE,
      maxInventoryItems: MAX_INVENTORY_ITEMS,
    }),
  };
};
