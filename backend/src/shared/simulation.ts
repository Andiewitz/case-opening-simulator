/**
 * Roll simulation — the whole economy lives in this file.
 *
 * Every randomness source goes through an injectable `rng` so the drop table
 * can be tested deterministically (docs/plan.md T0/T1–T3) and a roll can be
 * replayed from a seeded generator when supporting a dispute.
 *
 * Prices come from the baked Steam snapshot in `prices.ts`. That lookup is
 * injectable too: tests can pass `null` to keep the old deterministic price
 * ladder, or a resolver to assert the exact market-name wiring.
 */

import { getItemAvailability, lookupPrice, type PriceQuote, type PriceSource } from "./prices";

const RARITY_PRICES: Record<string, { min: number; max: number }> = {
  rarity_common: { min: 0.1, max: 0.5 },
  rarity_uncommon: { min: 0.2, max: 1 },
  rarity_rare_weapon: { min: 0.5, max: 5 },
  rarity_rare: { min: 0.2, max: 3 },
  rarity_mythical_weapon: { min: 2, max: 15 },
  rarity_mythical: { min: 1, max: 10 },
  rarity_legendary_weapon: { min: 10, max: 50 },
  rarity_legendary: { min: 5, max: 30 },
  rarity_ancient_weapon: { min: 30, max: 300 },
  rarity_ancient: { min: 100, max: 1500 },
};

const TIER1_BLUE_GEM_PATTERNS = [661, 387, 321, 670, 74, 269, 150];
const TIER2_BLUE_GEM_PATTERNS = [955, 92, 828, 592, 179, 310, 4];

const WEAR_CONDITIONS = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
];

const WEAR_FLOAT_RANGES: Record<string, { min: number; max: number }> = {
  "Factory New": { min: 0, max: 0.07 },
  "Minimal Wear": { min: 0.07, max: 0.15 },
  "Field-Tested": { min: 0.15, max: 0.38 },
  "Well-Worn": { min: 0.38, max: 0.45 },
  "Battle-Scarred": { min: 0.45, max: 1.0 },
};

const WEAR_MULTIPLIERS: Record<string, number> = {
  "Factory New": 1.0,
  "Minimal Wear": 0.85,
  "Field-Tested": 0.7,
  "Well-Worn": 0.55,
  "Battle-Scarred": 0.4,
};

/** Closest wear the real item exists in, used when the roll lands elsewhere. */
function nearestAllowedWear(target: string, allowed: string[]): string {
  const targetIndex = WEAR_CONDITIONS.indexOf(target);
  let best = allowed[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const wear of allowed) {
    const index = WEAR_CONDITIONS.indexOf(wear);
    if (index === -1) continue;
    const distance = Math.abs(index - targetIndex);
    if (distance < bestDistance) {
      best = wear;
      bestDistance = distance;
    }
  }
  return best;
}

export type Rng = () => number;
export type PriceLookup = (
  item: any,
  condition: string | null,
  isStatTrak: boolean
) => PriceQuote | null;

export function simulatePriceAndCondition(
  item: any,
  isSpecialItem = false,
  rng: Rng = Math.random,
  priceLookup: PriceLookup | null = lookupPrice
) {
  const rarityId = item.rarity?.id || "rarity_rare_weapon";
  let priceRange = RARITY_PRICES[rarityId] || { min: 0.5, max: 5 };

  if (isSpecialItem || item.name?.includes("★")) {
    priceRange = RARITY_PRICES["rarity_ancient"];
    const nameL = item.name.toLowerCase();
    if (nameL.includes("butterfly") || nameL.includes("karambit") || nameL.includes("m9 bayonet")) {
      priceRange = { min: 500, max: 3000 };
    }
  }

  const basePrice = rng() * (priceRange.max - priceRange.min) + priceRange.min;

  const isSticker =
    item.id?.startsWith("sticker-") ||
    item.id?.startsWith("patch-") ||
    item.id?.startsWith("graffiti-");

  if (isSticker) {
    // Consume no extra rng here: the price look-up happens after the same
    // rolls as before so the seeded replay and the animation stay identical.
    const quote = priceLookup ? priceLookup(item, null, false) : null;
    return {
      ...item,
      price: parseFloat((quote?.price ?? basePrice).toFixed(2)),
      priceSource: quote?.source ?? ("estimated" as PriceSource),
      priceProvider: quote?.provider ?? "Rarity estimate",
      priceUpdatedAt: quote?.updatedAt ?? null,
      condition: null,
      isStatTrak: false,
      float: null,
      pattern: null,
      phase: null,
    };
  }

  // One rng call picks the wear bracket, the next is the float inside it. We
  // draw both before applying availability so the seeded order stays identical
  // to the original implementation.
  const availability = getItemAvailability(item);
  const conditionRoll = rng() * 100;
  const floatRoll = rng();

  let rolledCondition = "Field-Tested";
  if (conditionRoll <= 3.0) rolledCondition = "Factory New";
  else if (conditionRoll <= 24.0) rolledCondition = "Minimal Wear";
  else if (conditionRoll <= 57.0) rolledCondition = "Field-Tested";
  else if (conditionRoll <= 81.0) rolledCondition = "Well-Worn";
  else rolledCondition = "Battle-Scarred";

  let condition: string | null;
  let condMul: number;
  let float: number | null;

  if (availability.wears && availability.wears.length === 0) {
    // Vanilla knives (and anything else with no wear) have no condition or
    // float. Their Steam market name is just "★ Bayonet".
    condition = null;
    condMul = 1;
    float = null;
  } else {
    // Some skins only exist in two wears. Use the nearest real wear instead of
    // inventing a Factory New MP7 Skulls that has never existed.
    const selectedWear =
      availability.wears && !availability.wears.includes(rolledCondition)
        ? nearestAllowedWear(rolledCondition, availability.wears)
        : rolledCondition;
    condition = selectedWear;
    const range = WEAR_FLOAT_RANGES[selectedWear] || WEAR_FLOAT_RANGES["Field-Tested"];
    condMul = WEAR_MULTIPLIERS[selectedWear] ?? 0.7;
    float = range.min + floatRoll * (range.max - range.min);
  }

  const pattern = Math.floor(rng() * 1000) + 1;
  let patternPremium = 1;
  if (item.name?.includes("Case Hardened")) {
    if (TIER1_BLUE_GEM_PATTERNS.includes(pattern)) {
      patternPremium = 100;
    } else if (TIER2_BLUE_GEM_PATTERNS.includes(pattern)) {
      patternPremium = 20;
    }
  }

  const phase = item.phase;
  let phasePremium = 1;
  if (phase) {
    if (phase === "Emerald" || phase === "Ruby" || phase === "Sapphire") {
      phasePremium = 8;
    } else if (phase === "Black Pearl") {
      phasePremium = 5;
    }
  }

  // Always consume the roll so the seeded sequence is stable, even for gloves
  // and other items that never have a StatTrak version.
  const statTrakRoll = rng() < 0.1;
  const isStatTrak = availability.statTrak === false ? false : statTrakRoll;

  // The market quote is for the exact rolled variant (wear + StatTrak). If it
  // exists, use it as the base and only apply a pattern/phase premium on top:
  // Steam lists one Doppler market name for every phase, so a phase premium is
  // an estimate, not another market name.
  const quote = priceLookup ? priceLookup(item, condition, isStatTrak) : null;
  let finalPrice: number;
  let priceSource: PriceSource;
  let priceProvider: string | null;
  let priceUpdatedAt: string | null;

  if (quote) {
    finalPrice = quote.price;
    priceSource = quote.source;
    priceProvider = quote.provider ?? null;
    priceUpdatedAt = quote.updatedAt ?? null;

    if (patternPremium !== 1 || phasePremium !== 1) {
      finalPrice *= patternPremium * phasePremium;
      priceSource = "estimated";
      priceProvider = `${quote.provider ?? "Steam quote"} + pattern/phase premium`;
    }
  } else {
    // Last resort: the old generated ladder. This keeps the economy sane for
    // brand-new items that the market has not listed yet, but it is always
    // labelled so the UI does not present it as a Steam quote.
    finalPrice = basePrice * condMul;
    if (patternPremium !== 1) finalPrice *= patternPremium;
    if (phasePremium !== 1) finalPrice *= phasePremium;
    if (isStatTrak) finalPrice *= 2.5;
    priceSource = "estimated";
    priceProvider = "Rarity estimate";
    priceUpdatedAt = null;
  }

  return {
    ...item,
    price: parseFloat(finalPrice.toFixed(2)),
    priceSource,
    priceProvider,
    priceUpdatedAt,
    condition,
    isStatTrak,
    float: float === null ? null : parseFloat(float.toFixed(4)),
    pattern,
    phase: phase || null,
  };
}

/**
 * Drop table (must sum to 100):
 *   ≤ 0.26  → Rare Special Item (gold), only when the crate has one
 *   ≤ 0.90  → Covert / Extraordinary
 *   ≤ 4.10  → Classified / Exotic
 *   ≤ 20.08 → Restricted / Remarkable / High Grade (Purple)
 *   rest    → the blue pool (all remaining items, or the whole crate)
 */
export const DROP_BANDS = {
  gold: 0.26,
  red: 0.9,
  pink: 4.1,
  purple: 20.08,
} as const;

export function generateCaseRoll(
  crate: any,
  rng: Rng = Math.random,
  priceLookup: PriceLookup | null = lookupPrice
) {
  const contains = crate.contains || [];
  const containsRare = crate.contains_rare || [];

  const itemsByRarity: Record<string, any[]> = {};
  contains.forEach((i: any) => {
    const rName = i.rarity?.name;
    if (!itemsByRarity[rName]) itemsByRarity[rName] = [];
    itemsByRarity[rName].push(i);
  });

  const hasRare = containsRare.length > 0;

  const roll = rng() * 100;
  let selectedItem = null;
  let isSpecialItem = false;

  const redTier = itemsByRarity["Covert"] || itemsByRarity["Extraordinary"] || [];
  const pinkTier = itemsByRarity["Classified"] || itemsByRarity["Exotic"] || [];
  const purpleTier =
    itemsByRarity["Restricted"] ||
    itemsByRarity["Remarkable"] ||
    itemsByRarity["High Grade (Purple)"] ||
    [];
  const blueTier =
    itemsByRarity["Mil-Spec Grade"] ||
    itemsByRarity["High Grade"] ||
    itemsByRarity["Industrial Grade"] ||
    itemsByRarity["Consumer Grade"] ||
    itemsByRarity["Base Grade"] ||
    contains;

  if (roll <= DROP_BANDS.gold && hasRare) {
    selectedItem = containsRare[Math.floor(rng() * containsRare.length)];
    selectedItem = {
      ...selectedItem,
      rarity: { id: "rarity_ancient", name: "Rare Special Item", color: "#ffd700" },
    };
    isSpecialItem = true;
  } else if (roll <= DROP_BANDS.red && redTier.length > 0) {
    selectedItem = redTier[Math.floor(rng() * redTier.length)];
  } else if (roll <= DROP_BANDS.pink && pinkTier.length > 0) {
    selectedItem = pinkTier[Math.floor(rng() * pinkTier.length)];
  } else if (roll <= DROP_BANDS.purple && purpleTier.length > 0) {
    selectedItem = purpleTier[Math.floor(rng() * purpleTier.length)];
  } else if (blueTier && blueTier.length > 0) {
    selectedItem = blueTier[Math.floor(rng() * blueTier.length)];
  }

  if (!selectedItem) {
    selectedItem = contains[Math.floor(rng() * contains.length)];
  }

  return simulatePriceAndCondition(selectedItem, isSpecialItem, rng, priceLookup);
}
