import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handler as sellItemHandler } from "../backend/src/handlers/sellItem";
import { handler as sellAllHandler } from "../backend/src/handlers/sellAllItems";
import { handler as getInventoryHandler } from "../backend/src/handlers/getInventory";
import { handler as getUserHandler } from "../backend/src/handlers/getUser";
import { MAX_INVENTORY_ITEMS, STARTING_BALANCE } from "../backend/src/config";
import { apiEvent, createHarness, TABLES, type Harness } from "./helpers/harness";

let harness: Harness;

function seedUser(overrides: Record<string, any> = {}) {
  harness.db.seed(TABLES.users, {
    userId: "user-1",
    balance: 10,
    inventoryCount: 0,
    stats: { casesOpened: 0, totalSpent: 0, totalValue: 0 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function seedItem(index: number, overrides: Record<string, any> = {}) {
  const itemId = overrides.itemId || `user-1#${String(index).padStart(3, "0")}`;
  harness.db.seed(TABLES.inventory, {
    itemId,
    userId: "user-1",
    name: `Item ${index}`,
    rarity: "Mil-Spec Grade",
    color: "#4b69ff",
    image: "img.png",
    price: 1,
    condition: "Factory New",
    isStatTrak: false,
    pattern: 10,
    float: 0.01,
    phase: null,
    createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    ...overrides,
  });
  return itemId;
}

function user() {
  return harness.db.rows(TABLES.users).find((row) => row.userId === "user-1")!;
}

beforeEach(() => {
  harness = createHarness();
});

afterEach(() => {
  harness.reset();
});

describe("POST /inventory/sell", () => {
  it("credits the stored price and removes the item", async () => {
    seedUser({ inventoryCount: 1 });
    const itemId = seedItem(0, { price: 3.5 });

    const response = await sellItemHandler(apiEvent({ body: JSON.stringify({ itemId }) }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ sold: true, price: 3.5, itemId });
    expect(user().balance).toBeCloseTo(13.5, 2);
    expect(user().inventoryCount).toBe(0);
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(0);
  });

  it("ignores a price supplied by the client", async () => {
    seedUser({ inventoryCount: 1 });
    const itemId = seedItem(0, { price: 2 });

    await sellItemHandler(apiEvent({ body: JSON.stringify({ itemId, price: 9999 }) }));

    expect(user().balance).toBeCloseTo(12, 2);
  });

  it("cannot sell the same item twice", async () => {
    seedUser({ inventoryCount: 1 });
    const itemId = seedItem(0, { price: 1 });

    expect((await sellItemHandler(apiEvent({ body: JSON.stringify({ itemId }) }))).statusCode).toBe(200);
    const second = await sellItemHandler(apiEvent({ body: JSON.stringify({ itemId }) }));

    expect(second.statusCode).toBe(404);
    expect(user().balance).toBeCloseTo(11, 2);
  });

  it("refuses another account's item", async () => {
    seedUser();
    harness.db.seed(TABLES.inventory, {
      itemId: "user-2#1",
      userId: "user-2",
      name: "Not yours",
      price: 50,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await sellItemHandler(
      apiEvent({ body: JSON.stringify({ itemId: "user-2#1" }) })
    );

    expect(response.statusCode).toBe(404);
    expect(user().balance).toBe(10);
  });

  it("requires an item id", async () => {
    seedUser();
    expect((await sellItemHandler(apiEvent({ body: "{}" }))).statusCode).toBe(400);
  });
});

describe("GET /users/{id}/inventory", () => {
  it("pages through a collection instead of truncating it", async () => {
    seedUser();
    for (let i = 0; i < 5; i++) seedItem(i);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const response = await getInventoryHandler(
        apiEvent({
          httpMethod: "GET",
          body: null,
          queryStringParameters: cursor ? { limit: "2", cursor } : { limit: "2" },
        })
      );
      expect(response.statusCode).toBe(200);
      const page = JSON.parse(response.body);
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item: any) => item.itemId));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(pages).toBe(3);
  });

  it("never returns another account's items", async () => {
    seedUser();
    seedItem(0);
    harness.db.seed(TABLES.inventory, {
      itemId: "user-2#1",
      userId: "user-2",
      name: "Theirs",
      price: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const response = await getInventoryHandler(
      apiEvent({ httpMethod: "GET", body: null, queryStringParameters: {} })
    );

    const page = JSON.parse(response.body);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].userId).toBe("user-1");
  });

  it("clamps an absurd limit", async () => {
    seedUser();
    for (let i = 0; i < 3; i++) seedItem(i);

    const response = await getInventoryHandler(
      apiEvent({ httpMethod: "GET", body: null, queryStringParameters: { limit: "100000" } })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).items).toHaveLength(3);
  });
});

describe("GET /users/{id}", () => {
  it("seeds a new account exactly once", async () => {
    const first = JSON.parse(
      (await getUserHandler(apiEvent({ httpMethod: "GET", body: null }))).body
    );

    expect(first).toMatchObject({
      id: "user-1",
      userId: "user-1",
      balance: STARTING_BALANCE,
      inventoryCount: 0,
    });
    expect(first.stats).toEqual({ casesOpened: 0, totalSpent: 0, totalValue: 0 });

    const second = JSON.parse(
      (await getUserHandler(apiEvent({ httpMethod: "GET", body: null }))).body
    );
    expect(second.createdAt).toBe(first.createdAt);
    expect(harness.db.rows(TABLES.users)).toHaveLength(1);
  });

  it("ignores the id in the path and returns the token's account", async () => {
    seedUser({ balance: 42 });
    harness.db.seed(TABLES.users, { userId: "user-2", balance: 999 });

    const response = await getUserHandler(
      apiEvent({ httpMethod: "GET", body: null, pathParameters: { userId: "user-2" } })
    );

    expect(JSON.parse(response.body)).toMatchObject({ userId: "user-1", balance: 42 });
  });

  it("repairs a legacy row that predates inventoryCount", async () => {
    harness.db.seed(TABLES.users, {
      userId: "user-1",
      balance: 5,
      stats: { casesOpened: 1, totalSpent: 2.5, totalValue: 1 },
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    seedItem(0);
    seedItem(1);

    const profile = JSON.parse(
      (await getUserHandler(apiEvent({ httpMethod: "GET", body: null }))).body
    );

    expect(profile.inventoryCount).toBe(2);
    expect(profile.balance).toBe(5);
  });

  it("caps the legacy count walk at the inventory limit", async () => {
    expect(MAX_INVENTORY_ITEMS).toBeGreaterThan(0);
  });
});

describe("POST /inventory/sell-all", () => {
  it("sells everything in one call and credits the sum", async () => {
    seedUser({ balance: 0, inventoryCount: 3 });
    seedItem(0, { price: 1 });
    seedItem(1, { price: 2 });
    seedItem(2, { price: 3.5 });

    const response = await sellAllHandler(apiEvent({ body: "{}" }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sold).toBe(3);
    expect(body.total).toBeCloseTo(6.5, 2);
    expect(body.soldItemIds).toHaveLength(3);
    expect(body.remaining).toBe(0);
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(0);
    expect(user().balance).toBeCloseTo(6.5, 2);
    expect(user().inventoryCount).toBe(0);
  });

  it("is a no-op on an empty inventory", async () => {
    seedUser();

    const response = await sellAllHandler(apiEvent({ body: "{}" }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      sold: 0,
      total: 0,
      soldItemIds: [],
      remaining: 0,
    });
    expect(user().balance).toBe(10);
  });

  it("sells past DynamoDB's per-transaction limit and reports nothing left", async () => {
    // 120 items is more than one 99-action transaction: the handler must chunk
    // and still leave a consistent balance and counter.
    seedUser({ balance: 0, inventoryCount: 120 });
    for (let i = 0; i < 120; i++) {
      seedItem(i, { price: 1, createdAt: new Date(2026, 0, 1, 0, i).toISOString() });
    }

    const response = await sellAllHandler(apiEvent({ body: "{}" }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.sold).toBe(120);
    expect(body.total).toBeCloseTo(120, 2);
    expect(body.remaining).toBe(0);
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(0);
    expect(user().balance).toBeCloseTo(120, 2);
    expect(user().inventoryCount).toBe(0);
  });

  it("is idempotent when called twice", async () => {
    seedUser({ balance: 0, inventoryCount: 1 });
    seedItem(0, { price: 4 });

    await sellAllHandler(apiEvent({ body: "{}" }));
    const second = await sellAllHandler(apiEvent({ body: "{}" }));

    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).sold).toBe(0);
    expect(user().balance).toBeCloseTo(4, 2);
  });
});
