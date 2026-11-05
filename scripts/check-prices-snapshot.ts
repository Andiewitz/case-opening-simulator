/**
 * Fails when the baked Steam price snapshot is missing, malformed, too sparse,
 * or has lost the known collector item that motivated this pipeline.
 *
 * Usage:
 *   npm run check:prices
 *   npm run check:prices -- --max-days 240
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PriceSnapshot } from "../backend/src/shared/prices";

const SNAPSHOT = "backend/src/shared/prices.json.gz";
const REASON = "Sticker | Reason Gaming (Holo) | Katowice 2014";

function argValue(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapshotAgeDays(path: string, asOf: string | undefined): { ageDays: number; source: string } {
  if (asOf && Number.isFinite(Date.parse(asOf))) {
    return {
      ageDays: (Date.now() - Date.parse(asOf)) / 86_400_000,
      source: `source data as of ${asOf}`,
    };
  }
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${path}"`, { encoding: "utf8" }).trim();
    if (iso) return { ageDays: (Date.now() - Date.parse(iso)) / 86_400_000, source: `commit ${iso}` };
  } catch {
    // Not a git checkout — fall through to mtime.
  }
  const mtime = statSync(path).mtimeMs;
  return { ageDays: (Date.now() - mtime) / 86_400_000, source: `mtime ${new Date(mtime).toISOString()}` };
}

function fail(message: string): never {
  console.error(`price snapshot: ${message}`);
  process.exit(1);
}

function main(): void {
  const path = resolve(process.cwd(), SNAPSHOT);
  if (!existsSync(path)) fail(`${SNAPSHOT} is missing — run npm run bake-prices`);

  let snapshot: PriceSnapshot;
  try {
    snapshot = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as PriceSnapshot;
  } catch (error: any) {
    fail(`${SNAPSHOT} is not valid gzip JSON (${error?.message ?? error})`);
  }

  const prices = snapshot?.prices || {};
  const items = snapshot?.itemNames || {};
  const priceNames = Object.keys(prices);
  if (priceNames.length === 0) fail("snapshot contains no prices");
  if (Object.keys(items).length === 0) fail("snapshot contains no item-name mappings");
  if (!snapshot.itemWears || Object.keys(snapshot.itemWears).length === 0) {
    fail("snapshot contains no wear availability data");
  }
  if (!snapshot.itemStatTrak || Object.keys(snapshot.itemStatTrak).length === 0) {
    fail("snapshot contains no StatTrak availability data");
  }

  const invalid = priceNames.filter((name) => {
    const price = prices[name]?.price;
    return !Number.isFinite(price) || price <= 0;
  });
  if (invalid.length > 0) fail(`${invalid.length} price entries are non-positive, e.g. ${invalid[0]}`);

  const missingSource = priceNames.filter((name) => !prices[name]?.source);
  if (missingSource.length > 0) fail(`${missingSource.length} price entries have no source label`);

  const coverage = snapshot.coverage;
  if (!coverage || !Number.isFinite(coverage.needed) || coverage.needed <= 0) {
    fail("snapshot has no coverage metadata");
  }
  const ratio = coverage.priced / coverage.needed;
  console.log(
    `price snapshot: ${coverage.priced}/${coverage.needed} variants quoted ` +
      `(${(ratio * 100).toFixed(1)}%; ${coverage.steam} Steam, ${coverage.reference} reference)`
  );
  if (ratio < 0.8) {
    fail(`only ${(ratio * 100).toFixed(1)}% of needed variants have a quote (minimum 80%)`);
  }

  const reason = prices[REASON];
  if (!reason || !(reason.price > 1_000)) {
    fail(`${REASON} is missing or has an implausible reference price`);
  }
  console.log(`known collector check: ${REASON} = $${reason.price.toFixed(2)} (${reason.source})`);
  if (snapshot.referenceAsOf) {
    console.log(`collector references as of: ${snapshot.referenceAsOf}`);
  }

  const { ageDays, source } = snapshotAgeDays(path, snapshot.asOf);
  console.log(`Steam source age: ${ageDays.toFixed(1)} days (${source})`);
  const maxDays = argValue("--max-days", 180);
  if (ageDays > maxDays) {
    fail(`source data is ${ageDays.toFixed(0)} days old (limit ${maxDays}) — run npm run bake-prices`);
  }
}

main();
