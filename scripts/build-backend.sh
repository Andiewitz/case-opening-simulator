#!/usr/bin/env bash
# Bundle TypeScript Lambda handlers into single-file CommonJS artifacts.
# Run BEFORE `terraform apply` — the data.archive_file data source in
# terraform/lambda.tf zips this output directory.
#
# @aws-sdk/* is left external on purpose: the Node 22 Lambda runtime ships AWS
# SDK v3 (including lib-dynamodb), so the zip carries no node_modules.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

ESBUILD=./node_modules/.bin/esbuild
OUT=backend/dist
CRATES_SNAPSHOT=backend/src/shared/crates.json.gz
mkdir -p "$OUT"

# The crate pool is baked into the deployment package at build time so
# Lambda never has to download the multi-megabyte GitHub feed at runtime.
# Refresh the snapshot when upstream cases change:
#   REFRESH_CRATES=1 ./scripts/build-backend.sh
# or: npm run bake-crates
if [ ! -f "$CRATES_SNAPSHOT" ] || [ "${REFRESH_CRATES:-0}" = "1" ]; then
  echo "Baking crates snapshot..."
  ./node_modules/.bin/tsx scripts/bake-crates.ts
fi

if [ ! -s "$CRATES_SNAPSHOT" ]; then
  echo "Missing or empty crates snapshot: $CRATES_SNAPSHOT" >&2
  exit 1
fi
gzip -t "$CRATES_SNAPSHOT"

for H in getCrates getConfig openCase sellItem sellAllItems getUser getInventory; do
  echo "Bundling handler: $H"
  "$ESBUILD" "backend/src/handlers/$H.ts" \
    --bundle --platform=node --format=cjs --target=node22 \
    --external:@aws-sdk/* \
    --minify \
    --outfile="$OUT/$H.js"
done

# Ship the baked snapshot at the Lambda package root. crates.ts resolves it
# from process.cwd() (/var/task in Lambda).
cp "$CRATES_SNAPSHOT" "$OUT/crates.json.gz"

echo "Backend build complete:"
ls -la "$OUT"
