# CS2 Unboxed

A Counter-Strike 2 case-opening simulator: animated reel, realistic drop rates,
float/pattern/StatTrak pricing, a persistent inventory and balance, and a
serverless AWS backend defined in Terraform.

The roll happens on the server. The browser only plays the animation for the
item the API already picked, so a modified client cannot choose its own drop.

## Quick start

Requires Node 22 or newer (`.nvmrc` pins 22).

```sh
npm ci          # one install: the backend is an npm workspace
npm run dev     # http://localhost:3000
```

`npm run dev` starts the frontend only. Case opening needs the API — set
`VITE_API_BASE_URL` in `.env` (see `.env.example`) or you will only see the
storefront's error state.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production frontend bundle in `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | ESLint (flat config, typescript-eslint + react-hooks) |
| `npm run typecheck` | `tsc --noEmit` for the frontend and the backend |
| `npm test` | Vitest, all suites (no AWS credentials needed) |
| `npm run check` | lint → typecheck → test → snapshot checks → build |
| `npm run build:backend` | Bundle the Lambda handlers into `backend/dist/` |
| `npm run bake-crates` | Refresh the baked crate snapshot from upstream |
| `npm run bake-prices` | Refresh the baked Steam price snapshot |
| `npm run check:crates` | Fail if the crate snapshot is missing, malformed or stale |
| `npm run check:prices` | Fail if the price snapshot is missing, sparse or stale |

## Environment variables

Frontend (browser-visible, put them in `.env`):

| Name | Read by | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `src/services/api.ts` | API Gateway base URL. Empty means "same origin". |
| `VITE_COGNITO_REGION` | `src/services/auth.ts` | Region of the user pool; used to build the Cognito endpoint. |
| `VITE_COGNITO_DOMAIN` | `src/services/auth.ts` | Cognito domain, used only for the refresh-token grant. |
| `VITE_COGNITO_CLIENT_ID` | `src/services/auth.ts` | Public app client id. |

Backend (Lambda environment, set in `terraform/lambda.tf`):

| Name | Read by | Default |
|---|---|---|
| `TABLE_USERS` | `backend/src/shared/utils.ts` | `cs2-unboxed-users-dev` |
| `TABLE_INVENTORY` | `backend/src/shared/utils.ts` | `cs2-unboxed-inventory-items-dev` |
| `ALLOWED_ORIGINS` | `backend/src/config.ts` | `http://localhost:3000` |
| `OPEN_COOLDOWN_MS` | `backend/src/config.ts` | `400` (`0` disables the throttle) |

## How it fits together

- **Frontend** — React 19 + TypeScript + Tailwind + React Router. Talks to the
  API with bearer tokens kept in `localStorage`; refreshes them single-flight.
- **Backend** — one Lambda per endpoint (`backend/src/handlers/`), API Gateway
  REST in front, DynamoDB behind. Money moves in DynamoDB transactions with
  conditions, never read-modify-write.
- **Crate data** — the upstream feed is baked into
  `backend/src/shared/crates.json.gz` at build time, so cold starts never fetch
  it. `refresh-crates.yml` re-bakes it weekly.
- **Prices** — the exact Steam market quote for the rolled wear/StatTrak
  variant comes from `backend/src/shared/prices.json.gz`, also baked at build
  time. There is no Steam call on the open path. Old collector stickers that
  Steam cannot price use a labelled cantry.dev reference; the rest fall back to
  a labelled estimate. See [docs/economy.md](docs/economy.md).
- **Infrastructure** — `terraform/`. Amplify Hosting serves the frontend today;
  CloudFront is behind `enable_cloudfront` (see
  [docs/aws-cloudfront-verification.md](docs/aws-cloudfront-verification.md)).

Start with [docs/architecture.md](docs/architecture.md). The API contract is in
[docs/api.md](docs/api.md), the maths in [docs/economy.md](docs/economy.md), the
test layout in [docs/testing.md](docs/testing.md), and operating procedures in
[docs/runbook.md](docs/runbook.md).

## Deploying

`.github/workflows/ci.yml` runs on every push and pull request.
`.github/workflows/deploy.yml` is manual, targets the protected `production`
environment and authenticates to AWS with GitHub OIDC. It requires these
repository variables — `AWS_REGION`, `AMPLIFY_APP_ID`, `AMPLIFY_BRANCH`,
`API_BASE_URL`, `FRONTEND_URL`, `TF_STATE_BUCKET`, `TF_STATE_KEY` — and one
secret, `AWS_ROLE_ARN`.

Backend deploy by hand:

```sh
npm run build:backend
cd terraform && terraform apply    # data.archive_file zips backend/dist
```

## Cost note

This runs on pay-per-request DynamoDB, Lambda and API Gateway in a single
region. For a hobby-level amount of traffic the bill is dominated by the fixed
pieces (a few cents for state/DNS), not by the per-request cost. The cheap
levers are already pulled: the crates feed is cached in the browser for an hour
and served pre-gzipped, and `/config` caches for five minutes.

## Status

Case opening, inventory, selling and sign-in all work against the deployed
stack. Known gaps: no password reset flow, no rate limiting beyond the per-user
open cooldown, and the frontend is deployed as a manual Amplify zip by CI.
