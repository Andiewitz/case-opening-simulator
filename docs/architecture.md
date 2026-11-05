# Architecture

```
Browser (React SPA, Amplify Hosting)
  │
  │  1. password sign-in  ─────────────►  Cognito user pool (USER_PASSWORD_AUTH)
  │     access/id/refresh tokens in localStorage
  │
  │  2. fetch + Authorization: Bearer <access token>
  ▼
API Gateway REST  ──►  one Lambda per route (backend/src/handlers/)
  │                        │
  │                        ├─ verify token: cognito-idp GetUser
  │                        ├─ read/write:   DynamoDB (users, inventory-items)
  │                        ├─ crate pool:   crates.json.gz baked into the zip
  │                        └─ price data:   prices.json.gz baked into the zip
  │
  └─ CORS: exact-origin echo · errors: JSON with `code` · logs: JSON to CloudWatch
```

## Request path for one case opening

1. `CaseOpener` mounts and calls `POST /cases/open` with `{ warmup: true }`
   (throttled to once per two minutes). Same Lambda, so this warms Cognito,
   DynamoDB, the crate pool and the Steam price snapshot before the user clicks.
   It writes nothing.
2. The user clicks Open. The client sends `{ crateId }` with its access token.
3. `openCase` verifies the token (`GetUser` → the username is the user id),
   checks the origin, and seeds/fetches the account row (`ensureUser`).
4. It takes advisory checks (balance, inventory cap, cooldown), loads the crate
   pool and rolls the item — **all randomness is server-side**.
5. One DynamoDB `TransactWriteItems` puts the item and updates the user with
   relative `ADD`s guarded by `balance >= :cost` (and the cap/cooldown
   conditions). A cancelled transaction becomes `409 CONFLICT`; nothing is
   written.
6. The response carries the item. The client drives the reel animation to that
   item — the timing lives in `CaseOpener.tsx` and is deliberately keyed to the
   audio, so it is not a place for "cleanup".

## Handlers and their contracts

| Handler | Route | Auth | Reads/writes |
|---|---|---|---|
| `getConfig` | `GET /config` | none | constants only |
| `getCrates` | `GET /crates` | none | baked snapshot (pre-gzipped body) |
| `openCase` | `POST /cases/open` | bearer | users + inventory (transaction) |
| `sellItem` | `POST /inventory/sell` | bearer | one item + users (transaction) |
| `sellAllItems` | `POST /inventory/sell-all` | bearer | all items in chunks of 99 + users |
| `getUser` | `GET /users/{userId}` | bearer | users (seeds on first read) |
| `getInventory` | `GET /users/{userId}/inventory` | bearer | inventory (paged query) |

`{userId}` in the path is ignored: every handler acts on the token's user, so
one account cannot read another's balance or inventory by editing the URL.

Shared modules in `backend/src/shared/`:

- `utils.ts` — clients, table names, CORS/preflight, JSON responses, structured
  logging, auth, body parsing.
- `users.ts` — `ensureUser` (idempotent seed + legacy row repair),
  `countInventory` (paged count).
- `inventory.ts` — `listInventory` (one page + cursor), `listAllInventory`.
- `simulation.ts` — the entire economy: drop table, condition/pattern/StatTrak.
- `prices.ts` — baked Steam price lookup, exact market-name construction, wear
  and StatTrak availability, and labelled fallbacks.
- `crates.ts` / `cratesData.ts` — baked snapshot loading and feed projection.

## DynamoDB key design

| Table | Partition key | Sort key | Why |
|---|---|---|---|
| `users` | `userId` | — | One row per account: balance, `inventoryCount`, `stats`, `lastOpenAt`. |
| `inventory-items` | `userId` | `itemId` | Every inventory read is "this user's items, newest first"; the sort key makes that one Query and lets a single item be deleted by key. |

`itemId` is `${userId}#${Date.now()}#${random}` — unique without a separate
counter, and it sorts roughly by acquisition time alongside `createdAt`.

Counters (`inventoryCount`, `stats.*`) are maintained with `ADD` in the same
transaction as the money change so they can never drift from the item rows.
`inventoryCount` is repairable: if a legacy row has no count, `ensureUser`
recounts from the table (paged) and writes it back.

## Frontend state flow

```
localStorage (tokens + cached id-token profile)
   │
   ├── onAuthStateChanged (window event "cs2_unboxed_auth_changed" + storage)
   │        │
   │        └── App.tsx fetches GET /users/{id} and merges balance/stats
   │
   ├── getValidAccessToken(): refreshes within 60s of expiry, one refresh
   │   in flight for all callers, clears the session if the refresh is rejected
   │
   └── useEconomy(): GET /config once per session, shared by every page
```

Routes: `/` (storefront), `/case/:id` (opener), `/inventory`, `*` (404).
`ErrorBoundary` wraps the app; toasts and the confirm dialog are the only
user-facing error surfaces (no `alert`).

## Deployment topology

- **Frontend** — Amplify Hosting branch `main` (`terraform/amplify.tf`), deployed
  by CI as a zip. CloudFront + S3 is defined but disabled behind
  `enable_cloudfront`; the S3 website endpoint that used to be public is now
  `public_website_interim = false` (bucket private).
- **API** — REST API, stage named after `var.environment`, one Lambda per
  handler, Node 22 runtime, 7-day log retention.
- **Data** — two on-demand DynamoDB tables.
- **Auth** — one Cognito user pool with a public app client; password auth is
  called directly from the browser.
