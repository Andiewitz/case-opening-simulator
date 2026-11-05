/**
 * Bake Steam Community Market prices into the Lambda deployment package.
 *
 * Sources:
 *   - SKINSTRACK/CS2-Price-API free Steam snapshots (items + stickers)
 *   - Gamer6MD/CS2_SkinsMarket_Price (older Steam fallback)
 *   - cantry.dev Katowice 2014 / Krakow 2017 collector references for items
 *     Steam has no active listings for (notably Reason Gaming Holo)
 *
 * The output is keyed by the exact `market_hash_name` that the simulator will
 * build for the rolled wear/StatTrak variant. Case opens never touch Steam.
 *
 * Usage:
 *   npm run bake-prices
 *   tsx scripts/bake-prices.ts --crates /tmp/crates.json
 *
 * Optional flags let a developer use local copies when offline:
 *   --crates, --items, --stickers, --gamer, --kato14, --pgl17
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { CSGO_API_BASE } from "../backend/src/config";
import { projectCrates } from "../backend/src/shared/cratesData";
import type { PriceEntry, PriceSnapshot } from "../backend/src/shared/prices";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = join(root, "backend/src/shared/prices.json.gz");

const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];

const DEFAULTS = {
  crates: `${CSGO_API_BASE}/crates.json`,
  skins: `${CSGO_API_BASE}/skins.json`,
  items: "https://raw.githubusercontent.com/SKINSTRACK/CS2-Price-API/main/free_prices.json",
  stickers: "https://raw.githubusercontent.com/SKINSTRACK/CS2-Price-API/main/free_sticker_prices.json",
  gamer: "https://raw.githubusercontent.com/Gamer6MD/CS2_SkinsMarket_Price/main/prices.json",
  kato14: "https://cantry.dev/api/v2/prices/kato14",
  pgl17: "https://cantry.dev/api/v2/prices/pgl17",
};

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function readSource(source: string): Promise<any> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source} returned HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(resolve(source), "utf8"));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function addToISO(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value !== "string" || !value) return undefined;
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

/**
 * Every exact Steam market name the current crate pool can produce. We
 * deliberately skip souvenir variants: the simulator never rolls one.
 */
function skinMarketNames(
  name: string,
  wears: string[] | null,
  hasStatTrak: boolean
): string[] {
  if (!name) return [];
  const star = name.startsWith("★ ");
  const core = star ? name.slice(2) : name;

  // Vanilla knives have no wear suffix: "★ Bayonet", "★ StatTrak™ Bayonet".
  if (star && !name.includes("|")) {
    const vanilla = [`★ ${core}`];
    if (hasStatTrak) vanilla.push(`★ StatTrak™ ${core}`);
    return vanilla;
  }

  const names: string[] = [];
  for (const wear of wears && wears.length > 0 ? wears : WEARS) {
    names.push(star ? `★ ${core} (${wear})` : `${core} (${wear})`);
    if (hasStatTrak) {
      names.push(star ? `★ StatTrak™ ${core} (${wear})` : `StatTrak™ ${core} (${wear})`);
    }
  }
  return names;
}

function nonSkinMarketName(item: any): string | null {
  if (!item?.name) return null;
  if (item.id?.startsWith("sticker-")) return `Sticker | ${item.name}`;
  if (item.id?.startsWith("patch-")) return `Patch | ${item.name}`;
  if (item.id?.startsWith("graffiti-")) return `Sealed Graffiti | ${item.name}`;
  return item.name;
}

type Candidate = PriceEntry & { name: string };

async function main() {
  const cratesSource = arg("crates", DEFAULTS.crates);
  const skinsSource = arg("skins", DEFAULTS.skins);
  const itemsSource = arg("items", DEFAULTS.items);
  const stickersSource = arg("stickers", DEFAULTS.stickers);
  const gamerSource = arg("gamer", DEFAULTS.gamer);
  const katoSource = arg("kato14", DEFAULTS.kato14);
  const pglSource = arg("pgl17", DEFAULTS.pgl17);

  console.log("Loading crates projection...");
  const rawCrates = await readSource(cratesSource);
  if (!Array.isArray(rawCrates)) throw new Error("Crates feed is not an array");

  const crates = projectCrates(rawCrates);
  if (crates.length === 0) throw new Error("Projection produced zero crates");

  console.log("Loading skin wear/StatTrak availability...");
  const skinsJson = await readSource(skinsSource);
  if (!Array.isArray(skinsJson)) throw new Error("Skins feed is not an array");
  const skinsById = new Map<string, any>(skinsJson.map((skin: any) => [skin.id, skin]));

  const needed = new Set<string>();
  const itemNames: Record<string, string> = {};
  const itemWears: Record<string, string[]> = {};
  const itemStatTrak: Record<string, boolean> = {};
  for (const crate of crates) {
    for (const item of [...(crate.contains || []), ...(crate.contains_rare || [])]) {
      if (item.id?.startsWith("skin-")) {
        const skin = skinsById.get(item.id);
        const isVanilla = item.name.startsWith("★ ") && !item.name.includes("|");
        const wears = Array.isArray(skin?.wears)
          ? [...new Set<string>(skin.wears.map((wear: any) => wear?.name).filter(Boolean))]
          : isVanilla
            ? []
            : null;
        const hasStatTrak = typeof skin?.stattrak === "boolean" ? skin.stattrak : true;
        if (skin) {
          if (wears !== null) itemWears[item.id] = wears;
          itemStatTrak[item.id] = hasStatTrak;
        }
        for (const name of skinMarketNames(item.name, wears, hasStatTrak)) needed.add(name);
      } else {
        const name = nonSkinMarketName(item);
        if (!name) continue;
        itemNames[item.id] = name;
        needed.add(name);
      }
    }
  }
  if (needed.size === 0) throw new Error("No market names derived from the crate pool");

  const candidates = new Map<string, Candidate>();

  const add = (name: string, entry: PriceEntry) => {
    if (!name || !needed.has(name) || !Number.isFinite(entry.price) || entry.price <= 0) return;
    if (!candidates.has(name)) {
      candidates.set(name, { ...entry, price: round(entry.price), name });
    }
  };

  // Primary: current Steam lowest listings. SKINSTRACK's free snapshot is
  // intentionally frozen as sample data; it is still the freshest bulk Steam
  // feed available without an API key.
  console.log("Loading SKINSTRACK Steam item prices...");
  const itemsJson = await readSource(itemsSource);
  const itemRows = itemsJson?.data?.items;
  if (!Array.isArray(itemRows)) throw new Error("SKINSTRACK item feed has no data.items array");
  for (const row of itemRows) {
    const steam = (row.prices || []).find(
      (price: any) => price?.provider === "steam" && Number(price.price) > 0
    );
    if (!steam) continue;
    add(row.market_hash_name, {
      price: Number(steam.price),
      source: "steam",
      provider: "Steam Community Market",
      updatedAt: addToISO(steam.updated_at),
      buyOrder: Number(steam.meta?.buy_order) || undefined,
    });
  }

  console.log("Loading SKINSTRACK Steam sticker prices...");
  const stickerJson = await readSource(stickersSource);
  const stickerRows = stickerJson?.data?.stickers;
  if (!Array.isArray(stickerRows)) throw new Error("SKINSTRACK sticker feed has no data.stickers array");
  for (const row of stickerRows) {
    const steam = (row.prices || []).find(
      (price: any) => price?.provider === "steam" && Number(price.price) > 0
    );
    if (!steam) continue;
    add(row.market_hash_name, {
      price: Number(steam.price),
      source: "steam",
      provider: "Steam Community Market",
      updatedAt: addToISO(steam.updated_at),
      buyOrder: Number(steam.meta?.buy_order) || undefined,
    });
  }

  // Secondary Steam feed. It is old, so it only fills names the fresh snapshot
  // did not cover; it never overwrites a newer quote.
  console.log("Loading Gamer6MD Steam fallback prices...");
  try {
    const gamerJson = await readSource(gamerSource);
    for (const [name, value] of Object.entries<any>(gamerJson || {})) {
      if (!value || !(Number(value.price) > 0)) continue;
      add(name, {
        price: Number(value.price),
        source: "steam",
        provider: "Steam Community Market (older fallback)",
        updatedAt: addToISO(value.date),
      });
    }
  } catch (error: any) {
    console.warn(`Skipping Gamer6MD fallback: ${error?.message ?? error}`);
  }

  // Steam has no active listings for many old collector stickers. Use the
  // public cantry.dev index for those items instead of pretending the last
  // Steam sale (often a low outlier) is the current sell value.
  for (const [label, source] of [
    ["Katowice 2014", katoSource],
    ["Krakow 2017", pglSource],
  ] as const) {
    console.log(`Loading ${label} collector references...`);
    try {
      const rows = await readSource(source);
      if (!Array.isArray(rows)) throw new Error("reference feed is not an array");
      for (const row of rows) {
        if (!row?.name || !(Number(row.minBuyPrice) > 0)) continue;
        add(row.name, {
          price: Number(row.minBuyPrice),
          source: "reference",
          provider: `${row.provider || "collector market"} via cantry.dev`,
          updatedAt: addToISO(row.timestamp),
        });
      }
    } catch (error: any) {
      console.warn(`Skipping ${label} references: ${error?.message ?? error}`);
    }
  }

  const prices: Record<string, PriceEntry> = {};
  for (const [name, entry] of candidates) {
    const { name: _name, ...priceEntry } = entry;
    prices[name] = priceEntry;
  }

  if (Object.keys(prices).length === 0) throw new Error("No prices matched the crate pool");
  if (!prices["Sticker | Reason Gaming (Holo) | Katowice 2014"]) {
    throw new Error("Reason Gaming (Holo) Katowice 2014 is missing; the reference source failed");
  }

  const entries = Object.values(prices);
  const steamEntries = entries.filter((entry) => entry.source === "steam");
  const referenceEntries = entries.filter((entry) => entry.source === "reference");
  const steam = steamEntries.length;
  const reference = referenceEntries.length;
  const latest = (values: PriceEntry[]): string | undefined => {
    const dates = values
      .map((entry) => Date.parse(entry.updatedAt || ""))
      .filter((value) => Number.isFinite(value));
    return dates.length ? new Date(Math.max(...dates)).toISOString() : undefined;
  };
  const asOf = latest(steamEntries) ?? latest(entries) ?? new Date().toISOString();
  const referenceAsOf = latest(referenceEntries);

  const snapshot: PriceSnapshot = {
    generatedAt: asOf,
    asOf,
    referenceAsOf,
    currency: "USD",
    sources: [
      "Steam Community Market via SKINSTRACK/CS2-Price-API free snapshots",
      "Steam Community Market via Gamer6MD fallback",
      "cantry.dev Katowice 2014 / Krakow 2017 collector references",
      "ByMykel/CSGO-API skin wear and StatTrak availability",
    ],
    itemNames,
    itemWears,
    itemStatTrak,
    prices,
    coverage: {
      needed: needed.size,
      priced: entries.length,
      steam,
      reference,
    },
  };

  const json = JSON.stringify(snapshot);
  const gzip = gzipSync(Buffer.from(json), { level: 9 });
  writeFileSync(outputFile, gzip);

  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
  console.log(
    `Baked ${entries.length}/${needed.size} prices (${steam} Steam, ${reference} references): ` +
      `${mb(Buffer.byteLength(json))} MB JSON -> ${mb(gzip.length)} MB gzip (${outputFile})`
  );
  console.log(`Reason Gaming (Holo): $${prices["Sticker | Reason Gaming (Holo) | Katowice 2014"].price}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
