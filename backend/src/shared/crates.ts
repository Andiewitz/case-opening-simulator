import { gzipSync } from "node:zlib";
import { CSGO_API_BASE } from "../config";

const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { ts: number; crates: any[] } | null = null;

// Pre-baked response (JSON string gzipped) — repeated requests skip the
// expensive stringify/gzip cycle entirely.
let baked: { gzipB64: string; cratedAt: number } | null = null;

/**
 * The upstream crates feed is ~5 MB of JSON from GitHub. Downloading and
 * parsing it on every request was the dominant latency of the whole app
 * (~5-8 s per request, warm or cold). We instead:
 *   1. cache the parsed + projected dataset in Lambda memory for 10 minutes
 *      (warm containers serve it instantly, openCase included), and
 *   2. project each item down to the fields the app actually uses
 *      (id, name, image, rarity{id,name,color}) — the full feed is ~5 MB,
 *      the projection is ~10x smaller.
 */
function projectItem(i: any) {
  return {
    id: i.id,
    name: i.name,
    // Compact Steam CDN hash — the full ~250-char URL prefix would add
    // megabytes across 281 cases; clients rebuild it via src/lib/steam.ts.
    image: i.image ? i.image.replace("https://community.akamai.steamstatic.com/economy/image/", "") : i.image,
    rarity: i.rarity ? { id: i.rarity.id, name: i.rarity.name, color: i.rarity.color } : undefined,
    phase: i.phase,
  };
}

function projectCrate(c: any) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    image: c.image,
    contains: (c.contains || []).map(projectItem),
    contains_rare: (c.contains_rare || []).map(projectItem),
  };
}

export async function loadCrates(): Promise<any[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.crates;
  }
  const res = await fetch(`${CSGO_API_BASE}/crates.json`);
  const data = await res.json();
  const crates = data
    .filter(
      (c: any) =>
        (c.type === "Case" || c.type === "Sticker Capsule" || c.type === "Autograph Capsule") &&
        c.contains &&
        c.contains.length > 0
    )
    .map(projectCrate);
  cache = { ts: Date.now(), crates };
  baked = null;
  return crates;
}

/** Final gzipped (base64) body for the crates feed, rebuilt only when the underlying cache refreshes or expires. */
export async function getBakedGzip(): Promise<string> {
  const crates = await loadCrates(); // refreshes if stale, incl. first call
  const cratedAt = cache!.ts;
  if (!baked || baked.cratedAt !== cratedAt) {
    baked = {
      gzipB64: gzipSync(Buffer.from(JSON.stringify(crates))).toString("base64"),
      cratedAt,
    };
  }
  return baked.gzipB64;
}

/** Last successfully cached crates, or null — used as degrade-instead-of-fail fallback. */
export function staleCrates(): any[] | null {
  return cache ? cache.crates : null;
}
