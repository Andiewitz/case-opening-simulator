import { describe, expect, it } from "vitest";
import {
  DROP_BANDS,
  generateCaseRoll,
  simulatePriceAndCondition,
} from "../backend/src/shared/simulation";
import {
  BLUE_ONLY_CRATE,
  FIXTURE_CRATE,
  RARITY,
  fixedRng,
  seededRng,
  sequenceRng,
} from "./helpers/fixtures";

// rng order inside generateCaseRoll:
//   1 roll band, 2 item index, 3 price, 4 condition, 5 float, 6 pattern, 7 StatTrak
// The band roll is `rng() * 100`, so a band expressed in percent is passed as
// percent/100 here.
function rollWith(bandRollPercent: number) {
  return generateCaseRoll(FIXTURE_CRATE, sequenceRng(bandRollPercent / 100, 0, 0.5, 0.5, 0.5, 0.5, 0.9));
}

describe("drop table", () => {
  it("maps each band to its rarity tier", () => {
    expect(rollWith(0.1).rarity.name).toBe("Rare Special Item");
    expect(rollWith(0.27).rarity.name).toBe("Covert");
    expect(rollWith(1).rarity.name).toBe("Classified");
    expect(rollWith(5).rarity.name).toBe("Restricted");
    expect(rollWith(50).rarity.name).toBe("Mil-Spec Grade");
  });

  it("straddles every band boundary", () => {
    // Values are percent/100 * 100 inside the implementation, so assert just
    // inside each side of the boundary rather than exactly on it.
    const eps = 0.0001;
    expect(rollWith(DROP_BANDS.gold - eps).rarity.name).toBe("Rare Special Item");
    expect(rollWith(DROP_BANDS.gold + eps).rarity.name).toBe("Covert");
    expect(rollWith(DROP_BANDS.red - eps).rarity.name).toBe("Covert");
    expect(rollWith(DROP_BANDS.red + eps).rarity.name).toBe("Classified");
    expect(rollWith(DROP_BANDS.pink - eps).rarity.name).toBe("Classified");
    expect(rollWith(DROP_BANDS.pink + eps).rarity.name).toBe("Restricted");
    expect(rollWith(DROP_BANDS.purple - eps).rarity.name).toBe("Restricted");
    expect(rollWith(DROP_BANDS.purple + eps).rarity.name).toBe("Mil-Spec Grade");
  });

  it("never returns a gold item when the crate has none", () => {
    const result = generateCaseRoll(BLUE_ONLY_CRATE, sequenceRng(0.0001, 0, 0.5, 0.5, 0.5, 0.5, 0.9));
    expect(result.rarity.name).toBe("Mil-Spec Grade");
  });

  it("marks gold items with the gold color and special rarity", () => {
    const result = rollWith(0.1);
    expect(result.rarity.color).toBe("#ffd700");
    expect(result.rarity.id).toBe("rarity_ancient");
  });

  it("matches the published rates over 200k seeded rolls", () => {
    const rng = seededRng(42);
    const total = 200_000;
    let gold = 0;
    let statTrak = 0;
    let red = 0;
    let invalid = 0;

    for (let i = 0; i < total; i++) {
      const result = generateCaseRoll(FIXTURE_CRATE, rng);
      if (result.rarity?.name === "Rare Special Item") gold++;
      if (result.rarity?.name === "Covert" && result.rarity?.color === RARITY.red.color) red++;
      if (result.isStatTrak) statTrak++;
      if (!result.name || !(result.price > 0)) invalid++;
    }

    // Expected 0.26% gold, ±0.02 percentage points.
    expect(gold / total).toBeGreaterThan(0.0024);
    expect(gold / total).toBeLessThan(0.0028);
    // Expected 10% StatTrak, ±0.4 points.
    expect(statTrak / total).toBeGreaterThan(0.096);
    expect(statTrak / total).toBeLessThan(0.104);
    expect(red / total).toBeGreaterThan(0.006);
    expect(red / total).toBeLessThan(0.0072);
    expect(invalid).toBe(0);
  });
});

describe("price and condition", () => {
  const plain = { id: "item-1", name: "AK-47 | Redline", rarity: RARITY.blue };

  it("assigns Factory New for the lowest 3% of condition rolls", () => {
    const result = simulatePriceAndCondition(plain, false, sequenceRng(0.5, 0.03, 0.5, 0.5, 0.9));
    expect(result.condition).toBe("Factory New");
    expect(result.float).toBeCloseTo(0.035, 4);
  });

  it("moves to Minimal Wear just above the Factory New band", () => {
    const result = simulatePriceAndCondition(plain, false, sequenceRng(0.5, 0.0301, 0.5, 0.5, 0.9));
    expect(result.condition).toBe("Minimal Wear");
    expect(result.float).toBeCloseTo(0.11, 4);
  });

  it("assigns Battle-Scarred above 81%", () => {
    const result = simulatePriceAndCondition(plain, false, sequenceRng(0.5, 0.9, 0.5, 0.5, 0.9));
    expect(result.condition).toBe("Battle-Scarred");
    expect(result.float).toBeCloseTo(0.725, 4);
  });

  it("keeps floats inside the condition's range", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 2_000; i++) {
      const result = simulatePriceAndCondition(plain, false, rng);
      if (result.condition === "Factory New") expect(result.float).toBeLessThanOrEqual(0.07);
      if (result.condition === "Battle-Scarred") expect(result.float).toBeGreaterThanOrEqual(0.45);
    }
  });

  it("pays Tier 1 blue gems 100x and Tier 2 20x", () => {
    const item = { id: "ch-1", name: "AK-47 | Case Hardened", rarity: RARITY.pink };
    // rarity_legendary_weapon = 10..50, price roll 0.5 → 30; Field-Tested ×0.7
    const tier1 = simulatePriceAndCondition(item, false, sequenceRng(0.5, 0.5, 0.5, 660 / 1000, 0.9));
    expect(tier1.pattern).toBe(661);
    expect(tier1.price).toBeCloseTo(30 * 0.7 * 100, 2);

    const tier2 = simulatePriceAndCondition(item, false, sequenceRng(0.5, 0.5, 0.5, 954 / 1000, 0.9));
    expect(tier2.pattern).toBe(955);
    expect(tier2.price).toBeCloseTo(30 * 0.7 * 20, 2);

    const plainPattern = simulatePriceAndCondition(item, false, sequenceRng(0.5, 0.5, 0.5, 0, 0.9));
    expect(plainPattern.pattern).toBe(1);
    expect(plainPattern.price).toBeCloseTo(30 * 0.7, 2);
  });

  it("multiplies Doppler phases and keeps the phase on the item", () => {
    const emerald = simulatePriceAndCondition(
      { id: "d-1", name: "★ Karambit | Doppler", rarity: RARITY.red, phase: "Emerald" },
      true,
      sequenceRng(0.5, 0.5, 0.5, 0.5, 0.9)
    );
    // Karambit special range 500..3000 → base 1750; FT ×0.7; Emerald ×8
    expect(emerald.price).toBeCloseTo(1750 * 0.7 * 8, 2);
    expect(emerald.phase).toBe("Emerald");

    const blackPearl = simulatePriceAndCondition(
      { id: "d-2", name: "★ Karambit | Doppler", rarity: RARITY.red, phase: "Black Pearl" },
      true,
      sequenceRng(0.5, 0.5, 0.5, 0.5, 0.9)
    );
    expect(blackPearl.price).toBeCloseTo(1750 * 0.7 * 5, 2);
  });

  it("applies the 2.5x StatTrak multiplier on 10% of rolls", () => {
    const withSt = simulatePriceAndCondition(plain, false, sequenceRng(0.5, 0.6, 0.5, 0.5, 0.05));
    const withoutSt = simulatePriceAndCondition(plain, false, sequenceRng(0.5, 0.6, 0.5, 0.5, 0.5));
    expect(withSt.isStatTrak).toBe(true);
    expect(withSt.price).toBeCloseTo(withoutSt.price * 2.5, 2);
  });

  it("returns no float/pattern/condition for stickers", () => {
    const sticker = simulatePriceAndCondition(
      { id: "sticker-1", name: "Sticker | Test", rarity: RARITY.blue },
      false,
      fixedRng(0.5)
    );
    expect(sticker.condition).toBeNull();
    expect(sticker.float).toBeNull();
    expect(sticker.pattern).toBeNull();
    expect(sticker.isStatTrak).toBe(false);
  });

  it("prices purely off the rng it was given", () => {
    const a = simulatePriceAndCondition(plain, false, fixedRng(0.25));
    const b = simulatePriceAndCondition(plain, false, fixedRng(0.25));
    expect(a).toEqual(b);
  });
});
