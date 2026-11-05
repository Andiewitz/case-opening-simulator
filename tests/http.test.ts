import { gzipSync, gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

const cratesMock = {
  payload: null as string | null,
  error: null as Error | null,
  stale: null as any[] | null,
};

vi.mock("../backend/src/shared/crates", () => ({
  getBakedGzip: async () => {
    if (cratesMock.error) throw cratesMock.error;
    return cratesMock.payload;
  },
  staleCrates: () => cratesMock.stale,
}));

import { handler as getCratesHandler } from "../backend/src/handlers/getCrates";
import { handler as getConfigHandler } from "../backend/src/handlers/getConfig";
import { handler as openCaseHandler } from "../backend/src/handlers/openCase";
import { handler as getInventoryHandler } from "../backend/src/handlers/getInventory";
import { CASE_COST, MAX_INVENTORY_ITEMS, STARTING_BALANCE } from "../backend/src/config";
import { apiEvent } from "./helpers/harness";
import { FIXTURE_CRATES } from "./helpers/fixtures";

describe("CORS", () => {
  it("answers preflight for every route", async () => {
    for (const handler of [openCaseHandler, getInventoryHandler, getConfigHandler, getCratesHandler]) {
      const response = await handler(
        apiEvent({ httpMethod: "OPTIONS", headers: { origin: "http://localhost:3000" } })
      );
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("");
      expect(response.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
      expect(response.headers["Access-Control-Allow-Headers"]).toContain("Authorization");
      expect(response.headers["Access-Control-Allow-Methods"]).toContain("POST");
    }
  });

  it("never reflects an unlisted origin", async () => {
    const response = await openCaseHandler(
      apiEvent({ httpMethod: "OPTIONS", headers: { origin: "https://evil.example" } })
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(response.headers.Vary).toBe("Origin");
  });

  it("omits Access-Control-Allow-Origin for non-browser callers", async () => {
    const response = await getConfigHandler(apiEvent({ httpMethod: "GET", headers: {}, body: null }));
    expect(response.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("matches origins case-insensitively on header name", async () => {
    const response = await getConfigHandler(
      apiEvent({ httpMethod: "GET", headers: { Origin: "http://localhost:3000" }, body: null })
    );
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
  });

  it("marks authenticated responses uncacheable", async () => {
    const response = await openCaseHandler(apiEvent({ headers: {} }));
    expect(response.statusCode).toBe(401);
    expect(response.headers["Cache-Control"]).toBe("no-store");
  });
});

describe("GET /config", () => {
  it("publishes the economy settings the UI needs", async () => {
    const response = await getConfigHandler(apiEvent({ httpMethod: "GET", body: null }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      caseCost: CASE_COST,
      startingBalance: STARTING_BALANCE,
      maxInventoryItems: MAX_INVENTORY_ITEMS,
    });
    expect(JSON.parse(response.body).priceCurrency).toBe("USD");
    expect(response.headers["Cache-Control"]).toContain("public");
  });
});

describe("GET /crates", () => {
  const cratesJson = JSON.stringify(FIXTURE_CRATES);

  it("serves the pre-baked gzip body", async () => {
    cratesMock.payload = gzipSync(Buffer.from(cratesJson)).toString("base64");
    cratesMock.error = null;

    const response = await getCratesHandler(apiEvent({ httpMethod: "GET", body: null }));

    expect(response.statusCode).toBe(200);
    expect(response.isBase64Encoded).toBe(true);
    expect(response.headers["Content-Encoding"]).toBe("gzip");
    expect(response.headers["Cache-Control"]).toContain("max-age=3600");

    const decoded = JSON.parse(gunzipSync(Buffer.from(response.body, "base64")).toString("utf8"));
    expect(decoded).toHaveLength(FIXTURE_CRATES.length);
  });

  it("falls back to the in-memory snapshot when the baked body fails", async () => {
    cratesMock.error = new Error("missing gzip");
    cratesMock.stale = FIXTURE_CRATES;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await getCratesHandler(apiEvent({ httpMethod: "GET", body: null }));

    expect(response.statusCode).toBe(200);
    expect(response.isBase64Encoded).toBeUndefined();
    expect(JSON.parse(response.body)).toHaveLength(FIXTURE_CRATES.length);
    expect(warn).toHaveBeenCalled();
  });

  it("returns 502 when nothing can be served", async () => {
    cratesMock.error = new Error("missing gzip");
    cratesMock.stale = null;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await getCratesHandler(apiEvent({ httpMethod: "GET", body: null }));

    expect(response.statusCode).toBe(502);
    expect(error).toHaveBeenCalled();
  });
});
