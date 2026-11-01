#!/usr/bin/env bash
# Bundle TypeScript Lambda handlers into single-file CommonJS artifacts.
# Run BEFORE `terraform apply` — the data.archive_file data source in
# terraform/lambda.tf zips this output directory.
#
# Each handler bundles its @aws-sdk/* imports, so no node_modules is
# shipped to Lambda (small zip, fast cold starts).
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

ESBUILD=./node_modules/.bin/esbuild
OUT=backend/dist
mkdir -p "$OUT"

for H in getCrates openCase sellItem getUser getInventory; do
  echo "Bundling handler: $H"
  "$ESBUILD" "backend/src/handlers/$H.ts" \
    --bundle --platform=node --format=cjs --target=node22 \
    --outfile="$OUT/$H.js"
done

echo "Backend build complete:"
ls -la "$OUT"
