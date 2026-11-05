import { describe, expect, it } from "vitest";
import {
  buildMarketHashName,
  itemAvailabilityInSnapshot,
  lookupPriceInSnapshot,
  type PriceSnapshot,
} from "../backend/src/shared/prices";

const snapshot: PriceSnapshot = {
  currency: "USD",
  itemNames: {
    "sticker-reason": "Sticker | Reason Gaming (Holo) | Katowice 2014",
  },
  itemWears: {
    "skin-mp7": ["Minimal Wear", "Field-Tested"],
    "skin-gloves": ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"],
    "skin-vanilla": [],
  },
  itemStatTrak: {
    "skin-mp7": true,
    "skin-gloves": false,
    "skin-vanilla": true,
  },
  prices: {
    "AK-47 | Redline (Field-Tested)": { price: 31.68, source: "steam" },
    "StatTrak™ AK-47 | Redline (Field-Tested)": { price: 72.36, source: "steam" },
    "AK-47 | Redline (Minimal Wear)": { price: 50, source: "steam" },
    "Sticker | Reason Gaming (Holo) | Katowice 2014": {
      price: 43032.77,
      source: "reference",
      provider: "YouPin898 via cantry.dev",
    },
    "★ Karambit | Doppler (Factory New)": { price: 1000, source: "steam" },
    "★ StatTrak™ Karambit | Doppler (Factory New)": { price: 1500, source: "steam" },
    "★ Bayonet": { price: 900, source: "steam" },
    "★ StatTrak™ Bayonet": { price: 1200, source: "steam" },
  },
};

const redline = { id: "skin-redline", name: "AK-47 | Redline" };
const karambit = { id: "skin-karambit", name: "★ Karambit | Doppler" };
const vanilla = { id: "skin-vanilla", name: "★ Bayonet" };

describe("market hash names", () => {
  it("builds the exact skin, wear and StatTrak variant", () => {
    expect(buildMarketHashName(redline, "Field-Tested", false)).toBe(
      "AK-47 | Redline (Field-Tested)"
    );
    expect(buildMarketHashName(redline, "Field-Tested", true)).toBe(
      "StatTrak™ AK-47 | Redline (Field-Tested)"
    );
  });

  it("puts the star before StatTrak for knives", () => {
    expect(buildMarketHashName(karambit, "Factory New", false)).toBe(
      "★ Karambit | Doppler (Factory New)"
    );
    expect(buildMarketHashName(karambit, "Factory New", true)).toBe(
      "★ StatTrak™ Karambit | Doppler (Factory New)"
    );
  });

  it("omits the wear suffix for a vanilla knife", () => {
    expect(buildMarketHashName(vanilla, "Field-Tested", false)).toBe("★ Bayonet");
    expect(buildMarketHashName(vanilla, "Field-Tested", true)).toBe("★ StatTrak™ Bayonet");
  });

  it("uses the baked id-to-name map for stickers", () => {
    expect(
      buildMarketHashName(
        { id: "sticker-reason", name: "Reason Gaming (Holo) | Katowice 2014" },
        null,
        false,
        snapshot.itemNames
      )
    ).toBe("Sticker | Reason Gaming (Holo) | Katowice 2014");
  });
});

describe("price lookup", () => {
  it("uses the exact Steam quote for the rolled variant", () => {
    const quote = lookupPriceInSnapshot(snapshot, redline, "Field-Tested", false);
    expect(quote).toMatchObject({
      price: 31.68,
      source: "steam",
      marketHashName: "AK-47 | Redline (Field-Tested)",
    });
  });

  it("uses the exact StatTrak quote instead of multiplying the normal one", () => {
    const quote = lookupPriceInSnapshot(snapshot, redline, "Field-Tested", true);
    expect(quote?.price).toBe(72.36);
  });

  it("finds the collector reference for the sticker", () => {
    const quote = lookupPriceInSnapshot(
      snapshot,
      { id: "sticker-reason", name: "Reason Gaming (Holo) | Katowice 2014" },
      null,
      false
    );
    expect(quote).toMatchObject({
      price: 43032.77,
      source: "reference",
      provider: "YouPin898 via cantry.dev",
    });
  });

  it("scales a neighbouring wear when the exact wear has no listing", () => {
    const quote = lookupPriceInSnapshot(snapshot, redline, "Factory New", false);
    // The nearest quote is Minimal Wear at $50; FN is 1/0.85 of that.
    expect(quote?.source).toBe("estimated");
    expect(quote?.price).toBeCloseTo(58.82, 2);
  });

  it("derives StatTrak from the normal quote only when no ST quote exists", () => {
    const item = { id: "skin-redline", name: "AK-47 | Redline" };
    const quote = lookupPriceInSnapshot(
      { ...snapshot, prices: { ...snapshot.prices, "StatTrak™ AK-47 | Redline (Field-Tested)": undefined as any } },
      item,
      "Field-Tested",
      true
    );
    expect(quote?.source).toBe("estimated");
    expect(quote?.price).toBe(79.2);
  });

  it("returns null when neither the item nor a comparable variant is priced", () => {
    expect(lookupPriceInSnapshot(snapshot, { id: "skin-new", name: "AK-47 | New" }, "Factory New", false)).toBeNull();
  });
});

describe("wear and StatTrak availability", () => {
  it("reads the real wear list, the no-StatTrak flag and vanilla knives", () => {
    expect(itemAvailabilityInSnapshot(snapshot, { id: "skin-mp7" })).toEqual({
      wears: ["Minimal Wear", "Field-Tested"],
      statTrak: true,
    });
    expect(itemAvailabilityInSnapshot(snapshot, { id: "skin-gloves" })).toEqual({
      wears: ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"],
      statTrak: false,
    });
    expect(itemAvailabilityInSnapshot(snapshot, { id: "skin-vanilla" })).toEqual({
      wears: [],
      statTrak: true,
    });
  });

  it("does not guess for unknown items or stickers", () => {
    expect(itemAvailabilityInSnapshot(snapshot, { id: "skin-unknown" })).toEqual({
      wears: null,
      statTrak: null,
    });
    expect(itemAvailabilityInSnapshot(snapshot, { id: "sticker-reason" })).toEqual({
      wears: null,
      statTrak: null,
    });
    expect(itemAvailabilityInSnapshot(null, { id: "skin-mp7" })).toEqual({
      wears: null,
      statTrak: null,
    });
  });
});
