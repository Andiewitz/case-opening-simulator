# 0002 — Bake the crate snapshot instead of fetching upstream

Status: accepted · 2026-11-04

## Context

The crate pool comes from `ByMykel/CSGO-API` on GitHub: ~5 MB of JSON
(`crates.json`) that expands to far more once parsed. Fetching it at runtime
made cold Lambda containers take 2–4 seconds on `/crates` and on the first open,
and every warm container re-downloaded it every 10 minutes.

The pool changes a few times a year (a new case, a new capsule), not per request.

## Decision

`scripts/bake-crates.ts` projects the feed down to what the UI needs (id, name,
type, image hash, contained items with rarity) and gzips it into
`backend/src/shared/crates.json.gz` (992 KB, committed). The build copies it to
the Lambda package root; `crates.ts` reads and parses it once per container, and
`/crates` serves the file's bytes as the response body with
`Content-Encoding: gzip`.

A runtime fetch remains only as a development/missing-artifact fallback, and it
logs loudly when it is used.

## Consequences

- Cold start no longer touches the network for crate data, and `/crates` costs
  no stringify+gzip work.
- The pool is as fresh as the last bake. Guardrails: `refresh-crates.yml` re-bakes
  weekly and opens a PR, `npm run check:crates` fails CI when the snapshot is
  malformed or older than 120 days, and `tests/cratesData.test.ts` asserts it
  still parses to a non-empty list.
- A ~1 MB binary artifact lives in git. The alternative — fetching at build from
  GitHub — would make builds non-reproducible and lets an upstream change alter
  the drop pool without a diff.
- Item images are stored as CDN hashes with the prefix stripped, so a CDN base
  URL change is a frontend constant, not a snapshot re-bake.
