/**
 * Fails when the baked crate snapshot is missing, unreadable, stale, or has
 * drifted away from the upstream feed.
 *
 * The backend serves `backend/src/shared/crates.json.gz` instead of fetching the
 * upstream feed at runtime, so a snapshot that nobody refreshes quietly serves a
 * crate pool from a year ago. `refresh-crates.yml` re-bakes it weekly; this gate
 * makes a silent stall visible on the next pull request.
 *
 * Usage:
 *   tsx scripts/check-crates-snapshot.ts                 # offline checks only
 *   tsx scripts/check-crates-snapshot.ts --max-days 60   # tighten the age gate
 *   tsx scripts/check-crates-snapshot.ts --fetch          # also compare upstream
 *
 * `--fetch` is opt-in because CI should not depend on GitHub being reachable;
 * run it locally (or in the refresh job) when you want to know whether the
 * projection still matches what upstream publishes.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { CSGO_API_BASE } from "../backend/src/config";
import { projectCrates } from "../backend/src/shared/cratesData";

const SNAPSHOT = "backend/src/shared/crates.json.gz";
const MAX_DRIFT = 0.05;

function argValue(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Commit date when the file is tracked, mtime otherwise (e.g. a fresh bake). */
function snapshotAgeDays(path: string): { ageDays: number; source: string } {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "${path}"`, { encoding: "utf8" }).trim();
    if (iso) {
      return { ageDays: (Date.now() - Date.parse(iso)) / 86_400_000, source: `commit ${iso}` };
    }
  } catch {
    // Not a git checkout (release tarball, CI artifact) — fall through.
  }
  const mtime = statSync(path).mtimeMs;
  return { ageDays: (Date.now() - mtime) / 86_400_000, source: `mtime ${new Date(mtime).toISOString()}` };
}

function fail(message: string): never {
  console.error(`crates snapshot: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const path = resolve(process.cwd(), SNAPSHOT);
  if (!existsSync(path)) fail(`${SNAPSHOT} is missing — run npm run bake-crates`);

  let crates: any[];
  try {
    crates = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
  } catch (error: any) {
    fail(`${SNAPSHOT} is not valid gzip JSON (${error?.message ?? error})`);
  }

  if (!Array.isArray(crates) || crates.length === 0) fail("snapshot contains no crates");

  const empty = crates.filter((crate) => !Array.isArray(crate?.contains) || crate.contains.length === 0);
  if (empty.length > 0) {
    fail(`${empty.length} crate(s) have no items, e.g. ${empty[0]?.id ?? "(no id)"}`);
  }

  const maxDays = argValue("--max-days", 120);
  const { ageDays, source } = snapshotAgeDays(path);
  const items = crates.reduce((total, crate) => total + (crate.contains?.length ?? 0), 0);

  console.log(
    `crates snapshot: ${crates.length} crates, ${items} items, ${ageDays.toFixed(1)} days old (${source})`
  );

  if (ageDays > maxDays) {
    fail(`snapshot is ${ageDays.toFixed(0)} days old (limit ${maxDays}) — run npm run bake-crates`);
  }

  if (!process.argv.includes("--fetch")) return;

  const url = `${CSGO_API_BASE}/crates.json`;
  console.log(`comparing with upstream: ${url}`);
  const response = await fetch(url);
  if (!response.ok) fail(`upstream feed returned HTTP ${response.status}`);

  const upstream = projectCrates(await response.json());
  if (upstream.length === 0) fail("upstream projection is empty");

  const drift = Math.abs(upstream.length - crates.length) / upstream.length;
  console.log(
    `upstream: ${upstream.length} crates (snapshot has ${crates.length}, drift ${(drift * 100).toFixed(1)}%)`
  );
  if (drift > MAX_DRIFT) {
    fail(
      `projection drifted ${(drift * 100).toFixed(1)}% from upstream (limit ${
        MAX_DRIFT * 100
      }%) — run npm run bake-crates`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
