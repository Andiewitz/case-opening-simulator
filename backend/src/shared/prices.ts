/**
 * Steam Community Market price snapshot.
 *
 * Case opens should not depend on a live market request: Steam rate-limits
 * aggressively, prices move, and a slow fetch would land inside the open
 * transaction. `scripts/bake-prices.ts` turns the public Steam feeds into a
 * gzip file shipped with the Lambda; this module only reads that file.
 *
 * The snapshot is keyed by the exact Steam `market_hash_name` for the rolled
 * variant. That matters: an AK-47 Redline Field-Tested and Factory New are
 * different market items, and a StatTrak knife has its own name.
 *
 * Steam itself cannot price an item with no active listings. For a small
 * number of collector items (notably Katowice 2014 stickers) the bake script
 * adds a third-party reference quote and labels it `reference`; everything
 * else without a Steam quote falls back to the old rarity estimate and is
 * labelled `estimated`.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

export type PriceSource = "steam" | "reference" | "estimated";

export type PriceEntry = {
  price: number;
  source: Exclude<PriceSource, "estimated">;
  provider?: string;
  updatedAt?: string;
  buyOrder?: number;
};

export type PriceQuote = {
  price: number;
  source: PriceSource;
  provider?: string;
  updatedAt?: string;
  buyOrder?: number;
  /** The exact market name the quote came from. */
  marketHashName?: string;
};

export type PriceSnapshot = {
  generatedAt?: string;
  /** Latest Steam quote timestamp (not the collector-reference timestamp). */
  asOf?: string;
  referenceAsOf?: string;
  currency?: string;
  sources?: string[];
  itemNames: Record<string, string>;
  prices: Record<string, PriceEntry>;
  /** Skin id -> the wears that actually exist. [] means a vanilla knife. */
  itemWears?: Record<string, string[]>;
  /** Skin id -> whether a StatTrak version exists. */
  itemStatTrak?: Record<string, boolean>;
  coverage?: {
    needed: number;
    priced: number;
    steam: number;
    reference: number;
  };
};

export type ItemAvailability = {
  wears: string[] | null;
  statTrak: boolean | null;
};

const BAKED_CANDIDATES = [
  // Lambda runs with cwd=/var/task and the build copies prices.json.gz there.
  resolve(process.cwd(), "prices.json.gz"),
  resolve(process.cwd(), "backend/src/shared/prices.json.gz"),
  resolve(process.cwd(), "src/shared/prices.json.gz"),
];

let snapshot: PriceSnapshot | null | undefined;
let warnedMissing = false;

function loadSnapshot(): PriceSnapshot | null {
  if (snapshot !== undefined) return snapshot;

  snapshot = null;
  const path = BAKED_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!path) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn("[prices] Baked price snapshot not found; using rarity estimates");
    }
    return null;
  }

  try {
    const parsed = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as PriceSnapshot;
    if (!parsed || typeof parsed !== "object" || !parsed.prices) {
      throw new Error("snapshot has no prices object");
    }
    parsed.itemNames ||= {};
    snapshot = parsed;
    return snapshot;
  } catch (error: any) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(`[prices] Could not read baked price snapshot: ${error?.message ?? error}`);
    }
    return null;
  }
}

/** Test seam: forget the parsed snapshot so a fixture can be loaded again. */
export function resetPriceCache(): void {
  snapshot = undefined;
  warnedMissing = false;
}

/** Metadata for /config and for an inventory footer. */
export function getPriceSnapshotMeta(): {
  asOf: string | null;
  referenceAsOf: string | null;
  currency: string;
  count: number;
  generatedAt: string | null;
} | null {
  const data = loadSnapshot();
  if (!data) return null;
  return {
    asOf: data.asOf || null,
    referenceAsOf: data.referenceAsOf || null,
    currency: data.currency || "USD",
    count: Object.keys(data.prices).length,
    generatedAt: data.generatedAt || null,
  };
}

/**
 * What the real item can be: some skins only exist in two wears, gloves never
 * have StatTrak, and vanilla knives have no wear at all. `null` means the
 * snapshot does not know, so the simulator keeps its legacy behaviour.
 */
export function itemAvailabilityInSnapshot(
  data: PriceSnapshot | null,
  item: any
): ItemAvailability {
  const id = typeof item?.id === "string" ? item.id : "";
  if (!data || !id.startsWith("skin-")) return { wears: null, statTrak: null };
  return {
    wears: Array.isArray(data.itemWears?.[id]) ? data.itemWears![id] : null,
    statTrak: typeof data.itemStatTrak?.[id] === "boolean" ? data.itemStatTrak[id] : null,
  };
}

export function getItemAvailability(item: any): ItemAvailability {
  return itemAvailabilityInSnapshot(loadSnapshot(), item);
}

const WEAR_CONDITIONS = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
] as const;

// Must stay in step with the condition ladder in simulation.ts. These are only
// used to scale a real Steam quote from a neighbouring wear when the exact wear
// has no listing; they never price an item on their own.
const CONDITION_MULTIPLIERS: Record<string, number> = {
  "Factory New": 1.0,
  "Minimal Wear": 0.85,
  "Field-Tested": 0.7,
  "Well-Worn": 0.55,
  "Battle-Scarred": 0.4,
};

function isVanillaKnife(name: string): boolean {
  return name.startsWith("★ ") && !name.includes("|");
}

/**
 * Builds the exact Steam market hash name for a rolled item.
 *
 * Skins are base name + wear, with `StatTrak™` and the `★` prefix in the
 * positions Steam expects. Vanilla knives have no wear suffix. Stickers and
 * other non-skin items use the id→name map baked from the crate projection.
 */
export function buildMarketHashName(
  item: any,
  condition: string | null,
  isStatTrak: boolean,
  itemNames?: Record<string, string>
): string | null {
  if (!item || typeof item.name !== "string" || !item.name) return null;
  const id = typeof item.id === "string" ? item.id : "";

  if (!id.startsWith("skin-")) {
    const mapped = itemNames?.[id];
    if (mapped) return mapped;
    if (id.startsWith("sticker-")) return `Sticker | ${item.name.replace(/^Sticker \| /, "")}`;
    if (id.startsWith("patch-")) return `Patch | ${item.name.replace(/^Patch \| /, "")}`;
    if (id.startsWith("graffiti-")) return `Sealed Graffiti | ${item.name.replace(/^Sealed Graffiti \| /, "")}`;
    // Pins, music kits and any future non-skin type are already full names.
    return item.name;
  }

  const name = item.name;
  const star = name.startsWith("★ ");
  const core = star ? name.slice(2) : name;
  const wear = isVanillaKnife(name) ? null : condition;
  const statTrak = isStatTrak ? "StatTrak™ " : "";
  const suffix = wear ? ` (${wear})` : "";
  return star ? `★ ${statTrak}${core}${suffix}` : `${statTrak}${core}${suffix}`;
}

function usable(entry: PriceEntry | undefined): entry is PriceEntry {
  return !!entry && Number.isFinite(entry.price) && entry.price > 0;
}

function quoteFromEntry(entry: PriceEntry, marketHashName: string): PriceQuote {
  return {
    price: entry.price,
    source: entry.source,
    provider: entry.provider,
    updatedAt: entry.updatedAt,
    buyOrder: entry.buyOrder,
    marketHashName,
  };
}

/**
 * Looks up the exact variant, then degrades in a controlled way:
 *   1. exact Steam/reference quote
 *   2. same skin, neighbouring wear, scaled with the condition ladder
 *   3. non-StatTrak variant of the same wear, ×2.5
 *
 * Steps 2 and 3 are labelled `estimated` so callers can show that the number
 * is derived from Steam data rather than an exact market listing.
 */
export function lookupPriceInSnapshot(
  data: PriceSnapshot | null,
  item: any,
  condition: string | null,
  isStatTrak: boolean
): PriceQuote | null {
  if (!data) return null;

  const exactName = buildMarketHashName(item, condition, isStatTrak, data.itemNames);
  if (exactName) {
    const exact = data.prices[exactName];
    if (usable(exact)) return quoteFromEntry(exact, exactName);
  }

  if (!item?.id?.startsWith("skin-") || !item.name) return null;

  // A missing wear is common on illiquid knives. Scale the nearest wear that
  // does have a real quote instead of falling all the way back to rarity math.
  if (!isVanillaKnife(item.name) && condition) {
    const targetIndex = WEAR_CONDITIONS.indexOf(condition as (typeof WEAR_CONDITIONS)[number]);
    const targetMultiplier = CONDITION_MULTIPLIERS[condition];
    if (targetIndex !== -1 && targetMultiplier) {
      for (let distance = 1; distance < WEAR_CONDITIONS.length; distance++) {
        for (const direction of [-1, 1]) {
          const index = targetIndex + direction * distance;
          if (index < 0 || index >= WEAR_CONDITIONS.length) continue;
          const neighbour = WEAR_CONDITIONS[index];
          const neighbourName = buildMarketHashName(item, neighbour, isStatTrak, data.itemNames);
          if (!neighbourName) continue;
          const entry = data.prices[neighbourName];
          if (!usable(entry)) continue;

          const scaled = entry.price * (targetMultiplier / CONDITION_MULTIPLIERS[neighbour]);
          return {
            price: Math.max(0.01, Number(scaled.toFixed(2))),
            source: "estimated",
            provider: `Steam ${neighbour} quote scaled to ${condition}`,
            updatedAt: entry.updatedAt,
            marketHashName: neighbourName,
          };
        }
      }
    }
  }

  // If only the non-StatTrak version trades, use the old 2.5x rule but keep
  // the quote that produced it. This is still far closer than the rarity table.
  if (isStatTrak) {
    const plainName = buildMarketHashName(item, condition, false, data.itemNames);
    const plain = plainName ? data.prices[plainName] : undefined;
    if (usable(plain)) {
      return {
        price: Number((plain.price * 2.5).toFixed(2)),
        source: "estimated",
        provider: "Steam non-StatTrak quote × 2.5",
        updatedAt: plain.updatedAt,
        marketHashName: plainName!,
      };
    }
  }

  return null;
}

/** Runtime lookup against the baked snapshot. */
export function lookupPrice(item: any, condition: string | null, isStatTrak: boolean): PriceQuote | null {
  return lookupPriceInSnapshot(loadSnapshot(), item, condition, isStatTrak);
}

const hasPriceLookup = () => loadSnapshot() !== null;

/** True when production has the baked snapshot, even if a specific item misses. */
export function priceSnapshotLoaded(): boolean {
  return hasPriceLookup();
}

/** Exported for the snapshot validator. */
export const __testing = {
  WEAR_CONDITIONS,
  CONDITION_MULTIPLIERS,
  isVanillaKnife,
};
