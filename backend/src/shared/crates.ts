import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { CSGO_API_BASE } from "../config";
import { projectCrates } from "./cratesData";

/**
 * The upstream crates feed is a multi-megabyte JSON download from GitHub.
 * Fetching it at runtime made every cold Lambda container (and every warm
 * container after the old 10-minute cache expired) take 2–4 seconds.
 *
 * The fix is to bake the projected feed into the deployment artifact at
 * build time (see scripts/bake-crates.ts). At runtime we only read a ~1 MB
 * gzip file from the Lambda package and parse it once. No network fetch and
 * no TTL. The GitHub path remains only as a development/missing-artifact
 * fallback.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;

// Lambda runs with cwd=/var/task and the build copies crates.json.gz there.
// The other paths make local tsx/dev execution work from the repo root or
// from the backend directory.
const BAKED_CANDIDATES = [
  resolve(process.cwd(), "crates.json.gz"),
  resolve(process.cwd(), "backend/src/shared/crates.json.gz"),
  resolve(process.cwd(), "src/shared/crates.json.gz"),
];

let bakedPath: string | null | undefined;
let bakedGzipB64: string | null = null;
let bakedCrates: any[] | null = null;
let fallbackCache: { ts: number; crates: any[] } | null = null;
let warnedFallback = false;

function findBakedPath(): string | null {
  if (bakedPath === undefined) {
    bakedPath = BAKED_CANDIDATES.find((candidate) => existsSync(candidate)) || null;
  }
  return bakedPath;
}

function readBakedGzip(): Buffer {
  const path = findBakedPath();
  if (!path) throw new Error("Baked crates snapshot not found");
  return readFileSync(path);
}

function getBakedCrates(): any[] {
  if (!bakedCrates) {
    const parsed = JSON.parse(gunzipSync(readBakedGzip()).toString("utf8")) as any[];
    bakedCrates = parsed;
    return parsed;
  }
  return bakedCrates;
}

function warnFallback(): void {
  if (warnedFallback) return;
  warnedFallback = true;
  console.warn("[crates] Baked snapshot unavailable; falling back to upstream GitHub feed");
}

async function fetchUpstreamCrates(): Promise<any[]> {
  const res = await fetch(`${CSGO_API_BASE}/crates.json`);
  if (!res.ok) throw new Error(`Crates feed returned HTTP ${res.status}`);
  const data = await res.json();
  return projectCrates(data);
}

export async function loadCrates(): Promise<any[]> {
  try {
    return getBakedCrates();
  } catch {
    // Development fallback / packaging safety net. Production should always
    // hit the baked snapshot above.
    warnFallback();
  }

  if (fallbackCache && Date.now() - fallbackCache.ts < CACHE_TTL_MS) {
    return fallbackCache.crates;
  }

  const crates = await fetchUpstreamCrates();
  fallbackCache = { ts: Date.now(), crates };
  return crates;
}

/** Final gzipped (base64) body for the crates feed. */
export async function getBakedGzip(): Promise<string> {
  if (bakedGzipB64) return bakedGzipB64;

  try {
    bakedGzipB64 = readBakedGzip().toString("base64");
    return bakedGzipB64;
  } catch {
    warnFallback();
  }

  // Fallback only: build + gzip the upstream data in memory.
  const crates = await loadCrates();
  bakedGzipB64 = gzipSync(Buffer.from(JSON.stringify(crates))).toString("base64");
  return bakedGzipB64;
}

/** Last successfully cached crates, or null — used as degrade-instead-of-fail fallback. */
export function staleCrates(): any[] | null {
  return bakedCrates || fallbackCache?.crates || null;
}
