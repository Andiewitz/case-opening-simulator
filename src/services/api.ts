const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/** Error carrying the HTTP status and the API's machine-readable `code`. */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function headers(accessToken: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) h["Authorization"] = `Bearer ${accessToken}`;
  return h;
}

type ApiRequestInit = RequestInit & { accessToken?: string | null };

async function request(path: string, opts: ApiRequestInit = {}): Promise<any> {
  const { accessToken = null, ...init } = opts;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...headers(accessToken), ...init.headers },
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error) message = parsed.error;
      if (parsed?.code) code = parsed.code;
    } catch {
      if (raw) message = raw;
    }
    if (res.status === 401) message = "Your session expired. Please sign in again.";
    throw new ApiError(message, res.status, code);
  }

  return res.json();
}

export type EconomyConfig = {
  caseCost: number;
  startingBalance: number;
  maxInventoryItems: number;
  pricesAsOf?: string | null;
  priceReferencesAsOf?: string | null;
  priceCurrency?: string;
};

export async function getConfig(): Promise<EconomyConfig> {
  return request("/config", { method: "GET" });
}

export async function getCrates(): Promise<any[]> {
  return request("/crates", { method: "GET" });
}

export async function openCase(crateId: string, accessToken: string | null): Promise<any> {
  return request("/cases/open", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ crateId }),
  });
}

let lastWarmAt = 0;
const WARM_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Best-effort cold-start prefetch. This hits the same Lambda as `openCase`,
 * so it warms Cognito, DynamoDB, and the baked crate pool before the user
 * clicks Open. Throttled so route changes don't spam invocations.
 */
export async function warmCaseOpener(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  if (Date.now() - lastWarmAt < WARM_INTERVAL_MS) return;
  lastWarmAt = Date.now();

  try {
    await request("/cases/open", {
      method: "POST",
      accessToken,
      body: JSON.stringify({ warmup: true }),
    });
  } catch {
    // Allow a later mount to retry after a transient failure.
    lastWarmAt = 0;
  }
}

export async function sellItem(itemId: string, accessToken: string | null): Promise<any> {
  return request("/inventory/sell", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ itemId }),
  });
}

export async function sellAllItems(accessToken: string | null): Promise<any> {
  return request("/inventory/sell-all", {
    method: "POST",
    accessToken,
    body: JSON.stringify({}),
  });
}

export async function getUser(userId: string, accessToken: string | null): Promise<any> {
  return request(`/users/${userId}`, { method: "GET", accessToken });
}

export type InventoryPage = { items: any[]; nextCursor: string | null };

export async function getInventory(
  userId: string,
  accessToken: string | null,
  cursor?: string | null,
  limit = 60
): Promise<InventoryPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return request(`/users/${userId}/inventory?${params.toString()}`, {
    method: "GET",
    accessToken,
  });
}
