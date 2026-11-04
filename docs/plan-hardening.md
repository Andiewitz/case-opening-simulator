# Hardening backlog — commit-by-commit plan

Status: **H1–H3 implemented** · H4–H10 planned · Last updated: 2026-11-04

This exists because the first pass left known rough edges. Each item below is
sized to be one reviewable commit, with the acceptance check that proves it
landed. Items are ordered by "how likely is this to bite a real user".

| ID | Item | Size | Risk | Status |
|---|---|---|---|---|
| H1 | Report which guard cancelled an open | S | low | done |
| H2 | Sell inventories larger than one transaction | S | low | done |
| H3 | Catch crate-pool drift, not just age | S | low | done |
| H4 | End-to-end test of the reel landing on the server's item | M | low | planned |
| H5 | Password reset (Cognito forgot-password) | M | medium | planned |
| H6 | Route alarm notifications somewhere a human reads | S | low | planned |
| H7 | Branch protection + required checks | S | low | planned |
| H8 | Clear the remaining moderate advisories | M | medium | planned |
| H9 | Make the test fake enforce DynamoDB's real limits | S | low | planned |
| H10 | Post-deploy smoke job on a schedule | S | low | planned |

---

## H1 — Report which guard cancelled an open (done)

**Problem.** Every cancelled transaction returned `409 CONFLICT`, so a client
could not tell "you're out of money" from "you lost a race". Splitting the
guards into separate `ConditionCheck` items is not possible: DynamoDB rejects a
transaction containing two actions on the same item, and all three guards target
the user row.

**Change.** `backend/src/handlers/openCase.ts` re-reads the account on the error
path and classifies: `INSUFFICIENT_BALANCE` (409), `INVENTORY_FULL` (409),
`TOO_FAST` (429), else `CONFLICT` (409). Classification failure falls back to
`CONFLICT` so it can never mask the original error.

**Acceptance (met).** `tests/openCase.test.ts`: parallel opens against a $5
balance produce only `CONFLICT`/`INSUFFICIENT_BALANCE` and at least one of the
latter; five parallel opens with a 10s cooldown give exactly one success,
four `TOO_FAST`, one item, one charge.

## H2 — Sell inventories larger than one transaction (done)

**Problem.** `POST /inventory/sell-all` chunks at 99 items, but the response
implied the inventory was empty; a client with 500 items would see "sold 99".

**Change.** `sellAllItems.ts` recounts the table after the sale and returns
`remaining`; `src/pages/Inventory.tsx` loops (max 10 rounds) until `remaining`
is 0 and reports the true total, or tells the user items are left.

**Acceptance (met).** `tests/inventory.test.ts` sells 120 items in one request:
`sold: 120`, `remaining: 0`, balance 120, table empty.

## H3 — Catch crate-pool drift, not just age (done)

**Problem.** The gate only failed on a 120-day-old snapshot, so a bake that
silently projected half the pool would pass.

**Change.** `scripts/check-crates-snapshot.ts --fetch` compares the snapshot's
crate count with a fresh projection of the upstream feed and fails above 5%
drift. `--fetch` is opt-in so CI never depends on GitHub reachability;
`refresh-crates.yml` runs the offline checks on the PR it opens.

**Acceptance (met).** Run locally against upstream; prints both counts and the
drift percentage.

## H4 — End-to-end test of the reel landing on the server's item

**Problem.** `CaseOpener.tsx` maps the returned item to a reel index and stops
the animation on it. The timing is audio-synced and deliberately fragile; a
refactor there fails silently (the reel stops on the wrong card).

**Commit.** `test: assert the reel stops on the item the API returned`

**Files.** `tests/e2e/reel.spec.ts`, `playwright.config.ts`, a stub API in
`tests/e2e/stub-server.ts` (serves `/config`, `/crates`, `/cases/open` from the
fixtures), `package.json` script `test:e2e`.

**Acceptance.** With the stub returning a known gold item, the test opens the
case and asserts the card at the reel's stop position has that item's `itemId`;
runs headless in CI (`npx playwright install --with-deps chromium`).

**Note.** Do not assert audio or exact millisecond stops — assert the card.

## H5 — Password reset (Cognito forgot-password)

**Problem.** Users who forget a password are stuck; the README lists this as a
known gap.

**Commit.** `feat: add password reset to the sign-in modal`

**Files.** `src/services/auth.ts` (`forgotPassword`, `confirmForgotPassword`
using `ForgotPassword` / `ConfirmForgotPassword` JSON targets),
`src/components/AuthModal.tsx` (third step), `tests/auth.test.ts`.

**Acceptance.** Tests cover the happy path and the `CodeMismatchException`,
`ExpiredCodeException` and `LimitExceededException` mappings; a signed-out user
can request a code, submit it with a new password, and sign in.

## H6 — Route alarm notifications somewhere a human reads

**Problem.** The alarms exist but have no actions, so they only turn red on a
dashboard nobody watches.

**Commit.** `feat(infra): notify an SNS topic when alarms fire`

**Files.** `terraform/monitoring.tf` (new), `variables.tf`
(`alarm_email`, default `""`), both alarms.

**Acceptance.** With `alarm_email` set, `aws cloudwatch describe-alarms` shows
`AlarmActions` pointing at the topic and the subscription is confirmed.

## H7 — Branch protection + required checks

**Problem.** `main` is unprotected; a direct push can bypass CI.

**Commit.** none (repository settings). Use `gh api` or the web UI.

**Acceptance.** Direct push to `main` is rejected; a PR runs `ci.yml`; merging
requires the `app` and `terraform` jobs to pass.

## H8 — Clear the remaining moderate advisories

**Problem.** 11 moderate advisories remain, all in the ESLint toolchain
(`minimatch` DoS). `npm audit --audit-level=high` passes, so CI is green, but
the count is noise on every install.

**Commit.** `chore(deps): upgrade the lint toolchain`

**Files.** `package.json`, `eslint.config.js` (ESLint 10 flat config may need
`languageOptions` tweaks), `package-lock.json`.

**Acceptance.** `npm audit` reports 0; `npm run lint` reports 0 findings on the
existing tree; no rule disabled to get there.

## H9 — Make the test fake enforce DynamoDB's real limits

**Problem.** `FakeDynamo` accepts 200-action transactions and 5 MB items, so a
future change that exceeds a real limit would pass tests and fail in production.

**Commit.** `test: enforce transaction and item size limits in the fake`

**Files.** `tests/helpers/fakeDynamo.ts`, `tests/inventory.test.ts`.

**Acceptance.** A transaction with 101 actions throws `ValidationException`; an
item above 400 KB throws; a new test asserts `sell-all` stays under the limit at
the 500-item cap.

## H10 — Post-deploy smoke job

**Problem.** The deploy workflow checks the live site once; nothing notices a
regression that appears an hour later (expired certificate, broken rewrite,
empty crate pool).

**Commit.** `ci: schedule a production smoke check`

**Files.** `.github/workflows/smoke.yml`.

**Acceptance.** Runs hourly; curls `/`, `/inventory`, `/config`, and `/crates`
(asserting gzip); opens an issue on failure using `gh issue create`.

---

### Deliberately not planned

- Making `sell-all` fully atomic across chunks: DynamoDB's 100-action cap makes
  it impossible without a queue, and `soldItemIds` + `remaining` make the
  partial state recoverable.
- Moving the open cooldown to API Gateway usage plans: the per-user guard needs
  the user identity, which API keys do not carry.
- Replacing the baked snapshot with a runtime fetch: see
  [decisions/0002](decisions/0002-baked-crates-snapshot.md).
