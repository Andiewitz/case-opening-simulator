import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { CSGO_API_BASE } from "../backend/src/config";
import { projectCrates } from "../backend/src/shared/cratesData";

/**
 * Bake the projected crate pool into a gzip snapshot that ships with the
 * Lambda deployment package.
 *
 * Usage:
 *   npx tsx scripts/bake-crates.ts
 *   npx tsx scripts/bake-crates.ts /path/to/crates.json   # offline source
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = join(root, "backend/src/shared/crates.json.gz");

async function readSource(source: string): Promise<any[]> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Crates feed returned HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(resolve(source), "utf8"));
}

async function main() {
  const source = process.argv[2] || `${CSGO_API_BASE}/crates.json`;
  console.log(`Reading crates feed: ${source}`);

  const raw = await readSource(source);
  if (!Array.isArray(raw)) throw new Error("Crates feed is not an array");

  const crates = projectCrates(raw);
  if (crates.length === 0) throw new Error("Projection produced zero crates");

  const json = JSON.stringify(crates);
  const gzip = gzipSync(Buffer.from(json), { level: 9 });
  writeFileSync(outputFile, gzip);

  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
  console.log(
    `Baked ${crates.length} crates: ${mb(Buffer.byteLength(json))} MB JSON -> ${mb(
      gzip.length
    )} MB gzip (${outputFile})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
