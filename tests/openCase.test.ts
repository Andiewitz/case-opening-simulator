import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The handler reads the crate pool from the baked snapshot; tests use a fixture
// so assertions can pin exact rarities and ids.
vi.mock("../backend/src/shared/crates", async () => {
  const { FIXTURE_CRATES } = await import("./helpers/fixtures");
  return {
    loadCrates: async () => FIXTURE_CRATES,
    getBakedGzip: async () => "",
    staleCrates: () => FIXTURE_CRATES,
  };
});

import { handler } from "../backend/src/handlers/openCase";
import { CASE_COST, MAX_INVENTORY_ITEMS } from "../backend/src/config";
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

function open(crateId: string | null = "crate-test") {
  return handler(apiEvent({ body: JSON.stringify(crateId ? { crateId } : {}) }));
}

function user() {
  return harness.db.rows(TABLES.users).find((row) => row.userId === "user-1")!;
}

beforeEach(() => {
  harness = createHarness();
  process.env.OPEN_COOLDOWN_MS = "0";
});

afterEach(() => {
  harness.reset();
  process.env.OPEN_COOLDOWN_MS = "0";
});

describe("auth and validation", () => {
  it("rejects a request without a bearer token", async () => {
    const response = await handler(apiEvent({ headers: {} }));
    expect(response.statusCode).toBe(401);
  });

  it("rejects a malformed body", async () => {
    const response = await handler(apiEvent({ body: "{not json" }));
    expect(response.statusCode).toBe(400);
  });

  it("requires a crate id unless it is a warm-up", async () => {
    const response = await open(null);
    expect(response.statusCode).toBe(400);
  });

  it("rejects an unknown crate", async () => {
    seedUser();
    const response = await open("no-such-crate");
    expect(response.statusCode).toBe(404);
  });
});

describe("opening a case", () => {
  it("charges once, records stats, and stores the item", async () => {
    seedUser();
    const response = await open();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({ userId: "user-1", name: expect.any(String) });
    expect(body.price).toBeGreaterThan(0);
    expect(body.id).toBe(body.itemId);
    expect(["steam", "reference", "estimated"]).toContain(body.priceSource);
    expect(body.priceProvider).toEqual(expect.any(String));

    const stored = user();
    expect(stored.balance).toBeCloseTo(10 - CASE_COST, 2);
    expect(stored.inventoryCount).toBe(1);
    expect(stored.stats.casesOpened).toBe(1);
    expect(stored.stats.totalSpent).toBeCloseTo(CASE_COST, 2);
    expect(stored.stats.totalValue).toBeCloseTo(body.price, 2);

    const items = harness.db.rows(TABLES.inventory);
    expect(items).toHaveLength(1);
    expect(items[0].itemId).toBe(body.itemId);
    expect(items[0].priceSource).toBe(body.priceSource);
    expect(items[0].priceProvider).toBe(body.priceProvider);
    expect(items[0].priceUpdatedAt).toBe(body.priceUpdatedAt);
  });

  it("refuses when the balance cannot cover the case", async () => {
    seedUser({ balance: CASE_COST - 0.01 });
    const response = await open();

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).code).toBe("INSUFFICIENT_BALANCE");
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(0);
    expect(user().balance).toBeCloseTo(CASE_COST - 0.01, 2);
  });

  it("refuses when the inventory is full", async () => {
    seedUser({ inventoryCount: MAX_INVENTORY_ITEMS });
    const response = await open();

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).code).toBe("INVENTORY_FULL");
  });

  it("does not charge or store anything for a warm-up request", async () => {
    seedUser();
    const response = await handler(apiEvent({ body: JSON.stringify({ warmup: true }) }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ warm: true });
    expect(user().balance).toBe(10);
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(0);
  });

  it("seeds a brand-new account on its first open", async () => {
    // No seedUser(): the row does not exist yet, which used to 404.
    const response = await open();

    expect(response.statusCode).toBe(200);
    const stored = user();
    expect(stored.balance).toBeGreaterThan(0);
    expect(stored.stats.casesOpened).toBe(1);
  });
});

describe("concurrency", () => {
  it("never lets parallel opens overdraw the balance", async () => {
    // Exactly two opens are affordable.
    seedUser({ balance: CASE_COST * 2 });

    const responses = await Promise.all(Array.from({ length: 10 }, () => open()));
    const successes = responses.filter((response) => response.statusCode === 200);
    const conflicts = responses.filter((response) => response.statusCode === 409);

    expect(successes).toHaveLength(2);
    expect(conflicts).toHaveLength(8);
    // A cancelled transaction is re-read and classified, so the caller learns
    // whether the account ran out of money or simply lost a race.
    const codes = conflicts.map((response) => JSON.parse(response.body).code);
    expect(codes.every((code) => ["CONFLICT", "INSUFFICIENT_BALANCE"].includes(code))).toBe(true);
    expect(codes.filter((code) => code === "INSUFFICIENT_BALANCE").length).toBeGreaterThan(0);

    const stored = user();
    expect(stored.balance).toBeCloseTo(0, 2);
    expect(stored.balance).toBeGreaterThanOrEqual(0);
    expect(stored.inventoryCount).toBe(2);
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(2);
    expect(stored.stats.casesOpened).toBe(2);
  });

  it("keeps the balance and item count consistent under mixed load", async () => {
    seedUser({ balance: 100 });

    const results = await Promise.all(Array.from({ length: 8 }, () => open()));
    const succeeded = results.filter((response) => response.statusCode === 200).length;

    const stored = user();
    expect(stored.balance).toBeCloseTo(100 - succeeded * CASE_COST, 2);
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(succeeded);
    expect(stored.inventoryCount).toBe(succeeded);
  });
});

describe("throttling", () => {
  it("rejects a second open inside the cooldown window", async () => {
    process.env.OPEN_COOLDOWN_MS = "10000";
    seedUser({ balance: 50 });

    const first = await open();
    const second = await open();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(JSON.parse(second.body).code).toBe("TOO_FAST");
    expect(user().balance).toBeCloseTo(50 - CASE_COST, 2);
  });

  it("reports TOO_FAST when parallel opens hit the cooldown guard", async () => {
    process.env.OPEN_COOLDOWN_MS = "10000";
    seedUser({ balance: 50 });

    const responses = await Promise.all(Array.from({ length: 5 }, () => open()));
    const succeeded = responses.filter((response) => response.statusCode === 200);
    const throttled = responses.filter((response) => response.statusCode === 429);

    expect(succeeded).toHaveLength(1);
    expect(throttled).toHaveLength(4);
    expect(throttled.every((response) => JSON.parse(response.body).code === "TOO_FAST")).toBe(true);
    expect(user().balance).toBeCloseTo(50 - CASE_COST, 2);
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(1);
  });

  it("allows the next open once the window has passed", async () => {
    process.env.OPEN_COOLDOWN_MS = "1";
    seedUser({ balance: 50 });

    expect((await open()).statusCode).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await open()).statusCode).toBe(200);
  });
});

describe("origin checks", () => {
  it("rejects a mutating request from an unknown browser origin", async () => {
    seedUser();
    const response = await handler(
      apiEvent({
        headers: { authorization: "Bearer test-token", origin: "https://evil.example" },
        body: JSON.stringify({ crateId: "crate-test" }),
      })
    );

    expect(response.statusCode).toBe(403);
    expect(harness.db.rows(TABLES.inventory)).toHaveLength(0);
  });

  it("allows the configured origin", async () => {
    seedUser();
    const response = await handler(
      apiEvent({
        headers: { authorization: "Bearer test-token", origin: "http://localhost:3000" },
        body: JSON.stringify({ crateId: "crate-test" }),
      })
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
  });
});
