# API reference

Base URL: `https://<api-id>.execute-api.<region>.amazonaws.com/<environment>`
(`terraform output api_gateway_invoke_url`).

Every response is JSON unless noted. Authenticated routes take
`Authorization: Bearer <Cognito access token>`; the token's `GetUser` username
is the user id, so the `{userId}` in a path is never trusted.

## Conventions

- **CORS** — the response echoes `Access-Control-Allow-Origin` only when the
  request's `Origin` is in `ALLOWED_ORIGINS` (the Amplify branch plus localhost
  outside prod). Unknown origins get no such header, and state-changing routes
  (`/cases/open`, `/inventory/*`) reject them with `403 {"error":"Origin not allowed"}`.
  `OPTIONS` is answered by the same Lambda as the route, so preflight works even
  for a route that would otherwise 401.
- **Caching** — authenticated responses are `Cache-Control: no-store`.
  `/config` is `public, max-age=300, stale-while-revalidate=3600`; `/crates` is
  `public, max-age=3600, stale-while-revalidate=86400` and comes back
  `Content-Encoding: gzip` with `isBase64Encoded: true` (API Gateway decompresses
  for the browser).
- **Errors** — `{ "error": "<human message>", "code": "<MACHINE_CODE>" }`. The
  `code` is only present where the client needs to branch; `error` is always
  safe to show.
- **Logging** — each handler emits one JSON line with `level`, `name`,
  `requestId`, `route` and handler-specific fields; failures use
  `logFailure` and include `error`/`message`.

## `GET /config`

Public. The single source of truth for economy numbers the UI displays.

```json
{ "caseCost": 2.5, "startingBalance": 100, "maxInventoryItems": 500 }
```

`caseCost` is `CASE_COST` in `backend/src/config.ts`; the storefront, the case
page and the button state all read it from here, so changing the constant
changes the displayed price with no frontend edit.

## `GET /crates`

Public. The crate pool used by the storefront.

- Body: gzipped JSON array (served from `backend/src/shared/crates.json.gz`),
  each crate `{ id, name, type, image, contains[], contains_rare[] }`.
- Items are projected: the Steam CDN prefix is stripped from `image` and only
  `id`, `name`, `image`, `rarity` are kept, which is what keeps the payload
  small enough to cache in a browser.
- If the baked body cannot be read, the handler serves its in-memory copy
  (uncompressed) and logs `get_crates_degraded`; if nothing is available it
  returns `502`.

## `POST /cases/open`

Auth required. Opens one case for the token's user.

```json
{ "crateId": "crate-…" }
```

Success `200` — the rolled item, priced server-side:

```json
{
  "id": "user-123#1730000000000#ab12cd",
  "itemId": "user-123#1730000000000#ab12cd",
  "userId": "user-123",
  "name": "AK-47 | Redline",
  "rarity": "Covert",
  "color": "#eb4b4b",
  "image": "…",
  "price": 42.17,
  "condition": "Field-Tested",
  "isStatTrak": false,
  "pattern": 512,
  "float": 0.2143,
  "phase": null,
  "createdAt": "2026-11-04T10:00:00.000Z"
}
```

Errors:

| Status | `code` | When |
|---|---|---|
| 400 | — | body is not JSON, or `crateId` is missing |
| 401 | — | missing/invalid bearer token |
| 403 | — | browser origin not allowlisted |
| 404 | — | unknown `crateId` |
| 409 | `INSUFFICIENT_BALANCE` | balance below the case cost |
| 409 | `INVENTORY_FULL` | account holds `maxInventoryItems` items |
| 409 | `CONFLICT` | the guarded transaction was cancelled by a concurrent change — retry |
| 429 | `TOO_FAST` | another open inside `OPEN_COOLDOWN_MS` |
| 500 | — | unexpected failure (logged as `open_case_failed`) |

The 409/429 checks are read from the account row and are advisory: the
transaction's `balance >= :cost` condition is what makes overdrawing impossible.

### `warmup`

`{ "warmup": true }` returns `{ "warm": true }` without `crateId`, without
charging and without writing. It is a latency hack: the case page calls it so
the cold-start cost (Cognito, DynamoDB, crate parse) is paid before the user
clicks Open. It is throttled client-side to once per two minutes.

## `POST /inventory/sell`

Auth required. Sells one item.

```json
{ "itemId": "user-123#1730000000000#ab12cd" }
```

Price always comes from the stored item; a `price` in the request body is
ignored. Success `200`: `{ "sold": true, "price": 42.17, "itemId": "…" }`.

Errors: `400` missing `itemId`; `401`; `403`; `404` no such item for this user;
`409 ALREADY_SOLD` if it was sold concurrently; `500`.

## `POST /inventory/sell-all`

Auth required. Sells every item the caller holds, in transactions of at most 99
items (DynamoDB's limit). Body `{}`.

```json
{ "sold": 128, "total": 812.44, "soldItemIds": ["…", "…"] }
```

`soldItemIds` is authoritative even if the request fails later, so the client
can refresh rather than guess. Empty inventory returns `{ "sold": 0, "total": 0,
"soldItemIds": [] }`. Errors: `401`; `403`; `409 CONFLICT` (your inventory
changed mid-sale — refresh and retry); `500`.

## `GET /users/{userId}`

Auth required; the path id is ignored and the token's account is returned.

```json
{
  "id": "user-123",
  "userId": "user-123",
  "balance": 97.5,
  "inventoryCount": 1,
  "stats": { "casesOpened": 1, "totalSpent": 2.5, "totalValue": 42.17 },
  "createdAt": "2026-11-04T10:00:00.000Z",
  "updatedAt": "2026-11-04T10:00:00.000Z"
}
```

Seeds the account on first read (starting balance, empty stats) and repairs rows
written before `stats`/`inventoryCount` existed. Errors: `401`, `500`.

## `GET /users/{userId}/inventory?limit=60&cursor=<itemId>`

Auth required. One page of the token's inventory, newest first.

```json
{ "items": [ … ], "nextCursor": "user-123#1730000000000#ab12cd" }
```

- `limit` defaults to 60 and is clamped to 1…200.
- `cursor` is the last `itemId` of the previous page; pass `nextCursor` back
  verbatim. `nextCursor: null` means there are no more pages. The old
  single-Query shape silently truncated at DynamoDB's 1 MB page limit.
- Errors: `401`, `500`.
