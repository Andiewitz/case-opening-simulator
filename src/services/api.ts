const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

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
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed ${res.status}`);
  }
  return res.json();
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

export async function sellItem(itemId: string, price: number, accessToken: string | null): Promise<any> {
  return request("/inventory/sell", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ itemId }),
  });
}

export async function getUser(userId: string, accessToken: string | null): Promise<any> {
  return request(`/users/${userId}`, { method: "GET", accessToken });
}

export async function getInventory(userId: string, accessToken: string | null): Promise<any[]> {
  return request(`/users/${userId}/inventory`, { method: "GET", accessToken });
}
