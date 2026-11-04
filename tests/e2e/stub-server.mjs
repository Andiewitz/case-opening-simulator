/**
 * Tiny API stub for the end-to-end tests: no AWS, no network, no prompts.
 *
 * It answers exactly the endpoints the case page touches, and returns a fixed
 * winner so the reel test can assert the animation lands on the item the API
 * reported rather than on a random tile.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.STUB_PORT || 4319);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const WINNER = {
  itemId: "e2e-winner",
  id: "e2e-winner",
  userId: "e2e-user",
  name: "AK-47 | Redline",
  rarity: "Covert",
  color: "#eb4b4b",
  image: "e2e-hash",
  price: 42.17,
  condition: "Field-Tested",
  isStatTrak: false,
  pattern: 512,
  float: 0.2143,
  phase: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const item = (id, name, color, rarity) => ({
  id,
  name,
  image: `hash-${id}`,
  rarity: { id: rarity, name: rarity, color },
});

const CRATE = {
  id: "e2e-crate",
  name: "E2E Case",
  type: "Case",
  image: "crate-hash",
  contains: [
    item("i1", "MP7 | Skulls", "#4b69ff", "rarity_rare_weapon"),
    item("i2", "AK-47 | Redline", "#eb4b4b", "rarity_rare_weapon"),
    item("i3", "AWP | Asiimov", "#d32ce6", "rarity_mythical_weapon"),
    item("i4", "Desert Eagle | Blaze", "#8847ff", "rarity_legendary_weapon"),
    item("i5", "P250 | Sand Dune", "#b0c3d9", "rarity_common"),
  ],
  contains_rare: [],
};

const PROFILE = {
  id: "e2e-user",
  userId: "e2e-user",
  email: "e2e@example.com",
  balance: 97.5,
  inventoryCount: 0,
  stats: { casesOpened: 1, totalSpent: 2.5, totalValue: 42.17 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS,
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

const server = createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  const { pathname } = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (pathname === "/config") {
    return send(res, 200, { caseCost: 2.5, startingBalance: 100, maxInventoryItems: 500 });
  }
  if (pathname === "/crates") {
    return send(res, 200, [CRATE]);
  }
  if (pathname === "/cases/open" && req.method === "POST") {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(raw || "{}");
      } catch {}
      if (body.warmup === true) return send(res, 200, { warm: true });
      return send(res, 200, WINNER);
    });
    return;
  }
  if (pathname.endsWith("/inventory")) {
    return send(res, 200, { items: [], nextCursor: null });
  }
  if (pathname.startsWith("/users/")) {
    return send(res, 200, PROFILE);
  }
  return send(res, 404, { error: `No stub route for ${req.method} ${pathname}` });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[stub-api] listening on http://127.0.0.1:${PORT}`);
});
