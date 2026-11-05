# Engineering Plan — fixes, CI/CD, tests, docs

Status: **implemented** · Last updated: 2026-11-04

## Implementation notes (read this before the plan body)

Every phase below is done. Four things changed while doing it, recorded here so
the plan does not claim something the code does not do:

1. **F1/F3 — one install, not two.** The duplicate dependency trees were the
   root cause of the clean-clone typecheck failure, so the repo moved to npm
   workspaces (`"workspaces": ["backend"]`, `backend/package-lock.json`
   deleted). `npm ci` at the root now installs the backend too, and CI runs a
   single install. `npm run setup` is that command.
2. **T0 seam delivered as an optional `rng` parameter** on
   `generateCaseRoll` / `simulatePriceAndCondition`, defaulting to
   `Math.random`; no call site changed.
3. **CI1's snapshot gate** is `npm run check:crates`
   (`scripts/check-crates-snapshot.ts`): it fails on a missing/unparseable
   snapshot, a crate with no items, or an age over 120 days. It does not diff
   against upstream — that would need network access in CI; freshness is
   enforced by `refresh-crates.yml` opening a PR weekly.
4. **Section 9 decisions were resolved** as: GitHub Actions (still an
   assumption — no remote is configured in this checkout); in-app password auth
   with the hosted-UI path deleted ([decisions/0003](decisions/0003-password-auth-via-cognito-json.md));
   `public_website_interim` default flipped to `false`; an optional GitHub OIDC
   deploy role added in `terraform/github-oidc.tf`, created only when
   `github_repository` is set.

Measured after implementation (Node 26.13.0, npm 11.20.0):

| Check | Result |
|---|---|
| `npm run check` (lint → typecheck → test → snapshot checks → build) | passes |
| Tests | 102 across 7 files, no AWS credentials |
| Frontend bundle | 430.63 kB raw / 138.25 kB gzip (was 579.52 / 183.87) |
| `npm run build:backend` | 7 handler bundles + `crates.json.gz` (992 KB) + `prices.json.gz` (342 KB) |
| `npm run check:crates` | 281 crates, 12,347 items |
| `npm run check:prices` | 18,092/19,912 variants quoted (90.9%; 18,004 Steam, 88 reference) |
| `terraform fmt -check -recursive` + `validate` | clean |
| `actionlint` on `.github/workflows/*.yml` | clean |
| `npm audit --audit-level=high` | passes (0 high/critical; 11 moderate, all lint-tooling) |
| Expected payout (weapon cases) | $6.46 per $2.50 open (100k seeded rolls over the real snapshot) |
| Expected payout (all crates) | $41.87 per $2.50 open — sticker capsules are the outlier, see docs/economy.md |

This is the working plan for turning CS2 Unboxed from "works on my machine and
deploys by hand" into something a second person can safely change. Items are
identified (`F*` fixes, `T*` tests, `CI*` pipeline, `D*` docs) so they can be
referenced in commits and issues.

Sizes: **S** ≈ under an hour, **M** ≈ half a day, **L** ≈ a day or more.

The sections below are kept as written when the plan was proposed; the
"Implementation notes" above is the current truth where they differ.

---

## 1. Baseline — what actually fails today

Measured on a clean checkout (`npm ci`, Node 26.13.0, npm 11.20.0):

| Check | Command | Result |
|---|---|---|
| Frontend build | `npm run build` | **Passes.** Main chunk 579.52 kB (183.87 kB gzip) — over Vite's 500 kB warning. |
| Root typecheck | `npx tsc --noEmit` (= `npm run lint`) | **Fails on a clean root-only install**: 6 × `TS2307` for `@aws-sdk/lib-dynamodb` / `client-dynamodb`, all originating in `backend/src`. |
| Same typecheck after `cd backend && npm ci` | `npx tsc --noEmit` | **Passes** — which proves `npm run lint` secretly depends on `backend/node_modules` existing. CI would go red on a fresh clone. |
| Backend typecheck | `cd backend && npx tsc --noEmit` | **Passes** standalone. |
| Backend bundle | `npm run build:backend` | **Passes**; produces 5 handler bundles + `crates.json.gz` (992 KB). |
| Tests | — | **None.** No runner, no `test` script, no test files. |
| Lint | `npm run lint` | `lint` *is* `tsc --noEmit`. ESLint is not a dependency; `eslint.config.js` contains only an `ignores` list. |
| CI | — | No `.github/`, no workflow of any kind. |
| Scheduled jobs | — | The baked crates snapshot is refreshed only by hand (`npm run bake-crates`). |

Root causes:

- **Root `tsconfig.json` has no `include`**, so `tsc --noEmit` compiles `backend/src` too — with a different dependency tree than `backend/package.json` provides. `backend/tsconfig.json` has `"include": ["src/**/*.ts"]` and excludes itself from the root run correctly, but the root run doesn't exclude `backend/`.
- **`esbuild` is used by `scripts/build-backend.sh` but never declared**; it resolves only because Vite happens to install it. A Vite upgrade or a `--omit=optional` install breaks the backend build with no warning in `package.json`.
- **Two dependency trees** (root + `backend/`) with no single command that installs both.

---

## 2. Phase 0 — make the toolchain trustworthy (S, unblocks everything)

Nothing else is worth automating until a clean checkout can verify itself.

| ID | Change | Files | Acceptance |
|---|---|---|---|
| F1 | Scope the frontend typecheck. Add `"include": ["src", "*.ts", "*.tsx"]` + `"exclude": ["backend", "dist", "node_modules"]` to the root tsconfig, or split into `tsconfig.app.json` / `tsconfig.backend.json` with `references`. | `tsconfig.json` | `npx tsc --noEmit` passes from a root-only `npm ci` with `backend/node_modules` deleted. |
| F2 | Declare `esbuild` in root `devDependencies` at the version already resolved in `package-lock.json`. | `package.json`, `package-lock.json` | `npm run build:backend` works after `npm ci`; `grep esbuild package.json` matches. |
| F3 | Add a single install entry point: `npm run setup` → `npm ci && npm --prefix backend ci`. Document it. | `package.json`, `README.md` | One command from a fresh clone gets a green `npm run lint && npm test`. |
| F4 | Pin the toolchain: `"engines": { "node": ">=22 <27" }` and `.nvmrc` (`22`). | `package.json`, `.nvmrc` | `node -v` mismatch is visible; CI uses the same version. |
| F5 | Remove the scaffold leftovers that imply features that don't exist: `GEMINI_API_KEY` in `.env.example` + `vite.config.ts`'s `define`, and the stray `fetch-test.ts` at repo root. Rename package `react-example` → `cs2-unboxed`. | `.env.example`, `vite.config.ts`, `fetch-test.ts`, `package.json` | `grep -ri gemini` returns nothing; `.env.example` lists only variables the code actually reads. |
| F6 | Add real linting (flat ESLint config with `typescript-eslint` + `react-hooks`), or delete `eslint.config.js` and rename the script to `typecheck`. Prefer the former; the current file does nothing. | `eslint.config.js`, `package.json` | `npm run lint` reports findings, not just types. |

---

## 3. Phase 1 — correctness and security fixes (P0)

These are the defects that can cost data or trust.

### F7 — Atomic balance updates (M) · `backend/src/handlers/openCase.ts:69-89`, `sellItem.ts:33-52`

**Bug.** Both handlers read the user, compute the new balance in JavaScript, then
write with an unconditional `SET balance = :bal` inside `TransactWriteItems`.
There is no `ConditionCheck` and no relative `ADD`. Consequences:

- Two concurrent opens (double-click, two tabs, retried request) both pass the
  `balance >= CASE_COST` check at `openCase.ts:41` and both write
  `balance = original - 2.50` — the user gets two items for one charge.
- An open racing a sell can lose the credit entirely (last writer wins).
- `stats.casesOpened` / `totalSpent` have the same read-modify-write hazard.

**Fix.** Make every money mutation a single transaction with a guard:

```ts
// openCase: charge and create, atomically, or fail the whole thing
{ ConditionCheck: { TableName: TABLE_USERS, Key: { userId },
    ConditionExpression: "balance >= :cost",
    ExpressionAttributeValues: { ":cost": CASE_COST } } }
{ Update: { TableName: TABLE_USERS, Key: { userId },
    UpdateExpression:
      "ADD balance :negCost, stats.casesOpened :one, stats.totalSpent :cost, stats.totalValue :value " +
      "SET updatedAt = :ua",
    ExpressionAttributeValues: { ":negCost": -CASE_COST, ":one": 1, ":cost": CASE_COST, ":value": price, ":ua": now } } }
{ Put: { TableName: TABLE_INVENTORY, Item: newItem } }
```

Map `TransactionCanceledException` to `409` with `{ error: "Insufficient balance" }`.
Use `ADD balance :price` for `sellItem` (no read of the user needed at all).

**Acceptance.** Handler test fires 10 concurrent opens for a balance of $5.00 and
asserts exactly 2 succeed, 8 return 409, the balance never goes negative, and the
inventory holds exactly 2 items.

### F8 — Seed users on first write (S) · `openCase.ts:31`, `sellItem.ts:32`

**Bug.** Both return `404 User not found` for a user whose row hasn't been created
yet. Today it works only because `App.tsx` calls `getUser` on every auth change —
an implicit ordering dependency across the network boundary. A user who opens a
case in a second tab, or after a `getUser` failure, gets a 404 that looks like an
auth problem.

**Fix.** Extract `ensureUser(userId)` in `shared/users.ts` and call it from
`getUser`, `openCase` and `sellItem`. Use `PutItem` with
`ConditionExpression: "attribute_not_exists(userId)"` to keep seeding idempotent
under concurrency.

**Acceptance.** A brand-new signed-in user can `POST /cases/open` as their very
first request and receives a 200 with a seeded starting balance.

### F9 — Single source of truth for the case price (S) · `config.ts:3`, `Home.tsx:7`, `CaseOpener.tsx:36`

**Bug.** `2.50` is hardcoded three times. The UI can silently disagree with the
charge.

**Fix.** Add a `GET /config` handler (or include `caseCost` in the `/crates`
response) and have both pages read it; keep one constant server-side.

**Acceptance.** Changing `CASE_COST` in `backend/src/config.ts` changes the
displayed price in the grid, on the case page, and the button state, with no
frontend edit.

### F10 — Restrict CORS (S) · `backend/src/shared/utils.ts:23`

**Bug.** `Access-Control-Allow-Origin: *` on an API that carries bearer tokens.
The token isn't ambient, so this is not CSRF-exploitable, but it lets any origin
drive the API with a stolen token and hides mistakes.

**Fix.** Allowlist from an env var (`ALLOWED_ORIGINS`), echo the request origin
when it matches, and allow `http://localhost:3000` in dev. Wire the variable in
`terraform/lambda.tf`.

**Acceptance.** Request with `Origin: https://evil.example` gets no
`Access-Control-Allow-Origin` header; the Amplify origin does.

---

## 4. Phase 2 — robustness and UX (P1)

| ID | Problem | Fix | Size |
|---|---|---|---|
| F11 | `getInventory` reads one DynamoDB page (1 MB cap) with no `LastEvaluatedKey` loop (`getInventory.ts:13`) — silently truncates a large collection. | Loop pages server-side; return `{ items, nextCursor }` and paginate in the UI. | M |
| F12 | `openCase` has no rate limit or cost ceiling; each call is a transactional write. | Per-user throttle (DynamoDB counter or API Gateway usage plan with an API key), plus an inventory item cap. | M |
| F13 | `handleSellAll` (`Inventory.tsx:57`) loops one HTTP request per item: N invocations, partial failure leaves the inventory half-sold with a generic `alert`. | Add `POST /inventory/sell-all`, transact up to 100 items per batch, report per-item results. | M |
| F14 | The browser bundles the AWS SDK for two calls; main chunk is 579 kB / 184 kB gzip. | Drop `@aws-sdk/client-cognito-identity-provider` from the frontend: `GlobalSignOut` → a plain `fetch` to `RevokeToken`/logout, delete the unused `getUserProfileFromCognito`. Target < 350 kB raw. | M |
| F15 | Two parallel auth paths: hosted-UI `Callback` route + `signIn`/`cognitoAuthUrl`/`completeSignIn` vs. the in-app `AuthModal`. Both are wired; only one is used. | Keep password auth as primary, but make the intent explicit: either delete the hosted-UI path or surface it (Google federation is already sketched in `terraform/variables.tf` but unset). | S |
| F16 | `alert` / `window.confirm` for errors and destructive actions (`CaseOpener.tsx:51,131`, `Inventory.tsx:51,68`); no 404 route; no error boundary. | In-app toast + confirm dialog, `<Route path="*">`, top-level error boundary. | M |
| F17 | No observability beyond `console.error` and one structured log. | Structured JSON logs with the request id; CloudWatch alarms on handler error rate. | S |
| F18 | Accessibility pass never done: modal has no focus trap or `role="dialog"`, reel has no `aria-live` announcement of the result. | Add dialog semantics, focus management, and announce the winning item at reveal. | M |

---

## 5. Phase 3 — tests (M–L)

No tests exist. The goal is a suite that fails when money handling or drop rates
regress, not blanket coverage.

**Prerequisite refactor (T0):** `simulatePriceAndCondition` and `generateCaseRoll`
call `Math.random()` directly (`simulation.ts:23,44,84,113`), so they cannot be
tested deterministically. Take an optional `rng: () => number` parameter
(defaulting to `Math.random`) and thread it through. This also makes replays
possible for support ("this roll was seed X").

Runner: **Vitest** (already Vite-native, no new transform config). Backend tests
run from the root workspace against `backend/src`, with `aws-sdk-client-mock` for
DynamoDB/Cognito — no AWS credentials needed.

| ID | Test | Asserts | Size |
|---|---|---|---|
| T1 | `simulation.rarityLadder` | With a stubbed rng, each band maps to the intended tier: gold `≤0.26`, Covert `≤0.90`, Classified `≤4.10`, Restricted `≤20.08`, else the blue pool. Fallback when a tier is empty. | M |
| T2 | `simulation.probabilities` | 200 k seeded rolls: gold within 0.26% ± 0.02, StatTrak ≈ 10% ± 0.3, every roll returns a valid item with `price > 0`. This is the regression net for the economy. | M |
| T3 | `simulation.modifiers` | Float→condition boundaries match the ladder; blue-gem patterns 661/387 (Tier 1) ×100 and 955/92 (Tier 2) ×20; Doppler Emerald/Ruby/Sapphire ×8, Black Pearl ×5; sticker path returns `null` float/pattern/condition. | M |
| T4 | `cratesData.projection` | `projectCrates` keeps only Case/Sticker/Autograph capsules with items, strips the Steam CDN prefix exactly once, is idempotent on already-stripped hashes, and the baked `crates.json.gz` parses and yields a non-empty array. | S |
| T5 | `openCase` handler (mocked DDB) | 401 without a token; 400 without `crateId`; 409 on insufficient balance; happy path writes one item + one guarded update; **F7's concurrency test**; `warmup: true` writes nothing. | L |
| T6 | `sellItem` / `getInventory` / `getUser` (mocked DDB) | Sell credits exactly the stored price and cannot be repeated (second call 404); inventory is scoped to the token's user id; `getUser` seeds $100 exactly once (F8). | M |
| T7 | Frontend units | `decodeJwt` on malformed/empty tokens; `getValidAccessToken` refreshes once for concurrent callers (single-flight) and clears state when the refresh token is rejected. | M |

Optional later: one Playwright smoke against `vite preview` — open a case with a
stubbed API and assert the reel lands on the pinned index 45 (this is the
timing logic most likely to break silently). Do this only after the unit layer is
stable; it needs a dev-only API stub.

**Acceptance.** `npm test` green from a fresh clone with no AWS credentials;
F7's fix flips a red test green (write the test first).

---

## 6. Phase 4 — CI/CD (M)

Assumption: GitHub Actions, since the repo has no remote configured here and no
CI today. If the real remote is GitLab/CodeBuild, the same stages apply with a
different YAML dialect — worth confirming before building it.

### CI1 — `ci.yml`, on every push and PR

```yaml
jobs:
  frontend:   # npm ci → npm run lint → npm run build → npm test
  backend:    # npm --prefix backend ci → tsc --noEmit → npm run build:backend → upload handler bundles
  terraform:  # terraform fmt -check -recursive → terraform init -backend=false → terraform validate
```

Notes that matter for this repo:

- Both `npm ci` calls are required — see F1/F3. Cache `~/.npm` keyed on both
  lockfiles (`package-lock.json`, `backend/package-lock.json`).
- `terraform validate` needs no credentials and catches most `.tf` typos.
  `backend.tf.example` exists but no real backend config is committed, so use
  `init -backend=false` and keep local state out of CI.
- Add a **snapshot freshness check**: fail if
  `backend/src/shared/crates.json.gz` is older than N days *or* if
  re-baking from upstream changes the projection count by more than 5%. Prevents
  quietly serving a year-old crate pool.
- Upload `dist/` and `backend/dist/` as artifacts so deploy jobs never rebuild.

### CI2 — `deploy.yml`, manual dispatch + tag, protected `production` environment

Stages: build → `terraform apply` (plan artifact reviewed first) → Amplify zip
deploy (`aws amplify create-deployment` + `start-deployment` with the `dist`
zip — today the docs say this is a manual zip upload) → smoke check the live URL
→ optional CloudFront invalidation.

- Authenticate with **GitHub OIDC → `AWS_ROLE_ARN`**. No long-lived keys in
  secrets; add the trust policy to `terraform/iam.tf`.
- `environment: production` with required reviewers; concurrency group so two
  deploys can't interleave (important: `aws_api_gateway_deployment` uses
  `create_before_destroy`).
- Post-deploy smoke: `GET /crates` returns 200 + `Content-Encoding: gzip`, the
  frontend serves `index.html`, and `/inventory` (an SPA route) returns 200, not
  404 — that last one is the Amplify rewrite rule failing, which is invisible
  until a user refreshes.

### CI3 — `refresh-crates.yml`, weekly schedule

Run `npm run bake-crates`, open a PR when the snapshot changes. Reviewable diff
plus the freshness gate from CI1.

### CI4 — hygiene

Dependabot/renovate for npm (root + backend) and Terraform providers grouped so
AWS SDK bumps don't flood the queue; CodeQL or `npm audit --audit-level=high`
(backend currently audits clean); branch protection requiring `ci.yml` green.

**Acceptance.** A PR that breaks the backend build, the typecheck, a drop-rate
test, or the Terraform syntax is red before review. Deleting `backend/node_modules`
locally no longer changes whether CI passes.

---

## 7. Phase 5 — documentation coverage (M)

| ID | Doc | Audience | Contents | Size |
|---|---|---|---|---|
| D1 | `README.md` (rewrite) | newcomer | What it is, screenshot, quick start (`npm run setup && npm run dev`), env var table (name / required / where it's read), test + build commands, deploy pointer, cost note. Delete the stale "deployment is not yet wired up" roadmap line or replace it with the real status. | M |
| D2 | `docs/architecture.md` | contributor | Request path diagram (browser → Cognito → API GW → Lambda → DynamoDB), the 5 handlers and their contracts, the DynamoDB key design (`userId` / `userId+itemId`) and why, the module map, and the frontend state flow (localStorage tokens → `onAuthStateChanged` event bus → profile refetch). | M |
| D3 | `docs/api.md` | contributor + integrator | One section per endpoint: method/path, auth, request shape, success + error responses with status codes (`400/401/404/409/500`), and the CORS/compression behaviour. Include the `warmup` flag on `/cases/open` and say plainly that it is a latency hack that writes nothing. | M |
| D4 | `docs/economy.md` | designer + reviewer | The drop table as a table (band → rarity → %), price ranges per rarity, float→condition thresholds, blue-gem and Doppler multipliers, StatTrak 10% ×2.5, starting balance, and the expected value per $2.50 open (worth computing — it's the one number players will ask about). | S |
| D5 | `docs/testing.md` | contributor | How to run each layer, how the DDB mocks work, how to add a seed case for the rng, and the expectation that money-path changes come with a test. | S |
| D6 | `docs/runbook.md` | operator | Rotate the crates snapshot; deploy frontend + backend; roll back a Lambda; Terraform state recovery; where the logs are (7-day retention) and which alarm fires; common failures (401 everywhere = token/Cognito, 502 on `/crates` = snapshot missing from the zip). Keep `docs/aws-cloudfront-verification.md` as-is and link it. | M |
| D7 | `docs/decisions/` (ADRs) | future maintainer | Short records for the three choices that otherwise look arbitrary: server-side roll (never trust the client), baked crates snapshot vs runtime fetch, password auth via raw Cognito calls vs hosted UI. | S |
| D8 | Inline comments | reader | Only where intent is invisible: the audio-synced timing block in `CaseOpener.tsx` already documents itself well — keep that pattern. Add the missing "why" to the `TransactWrite` blocks once F7 lands. | S |

Rule of thumb for all of the above: every env var, endpoint and scheduled job in
the code appears in exactly one doc, and every doc sentence can be traced to
code. Anything aspirational lives in this plan, not the README.

---

## 8. Recommended sequence

| Order | Items | Why first |
|---|---|---|
| 1 | F1–F6 | A clean clone must be verifiable before any pipeline exists. Cheap, unblocks everything. |
| 2 | CI1 + T1–T4 | Get a red/green signal in place while the code is still easy to reason about; the pure-function tests need no mocks or seam work beyond T0. |
| 3 | F7 + F8 + T5 | The money bug is the highest-consequence defect. Write the concurrency test first, then the fix. |
| 4 | F9, F10, CI2 | Before the next real deploy: correct price, tighter CORS, deploy path that isn't a manual zip. |
| 5 | D3, D4, D6 | The docs people need the moment they touch the API or the AWS account. |
| 6 | F11–F18, T6–T7, D1, D2, D5, D7, D8, CI3–CI4 | Steady improvement, in whatever order the next feature demands. |

---

## 9. Decisions needed

1. **CI host** — GitHub Actions is assumed; confirm the real remote before CI1.
2. **AWS deploy identity** — an OIDC role with permission to run `terraform apply`
   and push to Amplify. Without it, CI can still run everything except deploy.
3. **Auth direction** — keep in-app password auth and delete the hosted-UI path,
   or invest in the Google federation the Terraform variables already sketch
   (F15). This changes what the docs promise.
4. **Whether the interim S3 website path stays** — `public_website_interim = true`
   serves the site over HTTP with sign-in disabled. If Amplify is the frontend of
   record, that variable should default to `false` and the bucket policy tightened.

## 10. Explicitly out of scope

Multi-region, custom domains/TLS, migrating off AWS, real-money economy,
matchmaking, social features, and a redesign. Also not proposed here: switching
DynamoDB to another store — the access patterns are a good fit.
