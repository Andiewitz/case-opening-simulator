# Serverless Migration Plan: CS2 Unboxed

Migration from Firebase (Auth + Firestore) to AWS serverless:
- **Frontend** → S3 static website hosting (+ CloudFront)
- **Auth** → Amazon Cognito User Pools
- **Database** → Amazon DynamoDB (Users + InventoryItems tables)
- **Backend API** → Amazon API Gateway + AWS Lambda
- **SDK** → AWS SDK for JavaScript v3 (@aws-sdk/client-cognito-identity-provider, @aws-sdk/client-dynamodb, @aws-sdk/api-gateway-management-api or fetch to API Gateway)

Each phase below is a separate commit.

---

## Commit 1: Infrastructure scaffolding & environment config

**Goal:** Define AWS resources and local env vars without changing app behavior yet.

Files:
- `infrastructure/` (CDK or CloudFormation/Terraform) — placeholders
- `.env.example` — add `VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_REGION`
- `aws-config.js` / `src/lib/aws-config.ts` — region + Cognito identity provider config constants
- `package.json` — add `@aws-sdk/client-cognito-identity-provider`, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/util-create-client` (or `aws-amplify` if preferred)

Verification: `npm run lint` passes; `.env.example` documents new required vars.

---

## Commit 2: Cognito auth service (replace firebase auth)

**Goal:** Replace `src/services/firebase.ts` auth with Cognito; keep `db.ts` signatures stable so pages don't break yet.

Files:
- `src/services/cognito.ts` — `signInWithGoogle` (Cognito hosted UI / federated sign-in), `signOut`, `getCurrentUser`, `onAuthStateChanged` wrapper
- `src/services/auth.ts` — thin adapter exposing `loginWithGoogle()`, `logout()`, `auth` object compatible with existing `App.tsx` usage
- Update `App.tsx` to import from `./services/auth` instead of `./services/firebase`
- Remove `firebase` init from `src/services/firebase.ts` (keep file or delete; Firestore import removed)

Verification: `npm run lint` passes; app type-checks.

---

## Commit 3: DynamoDB data layer (replace firestore db.ts)

**Goal:** Replace `src/services/db.ts` Firestore calls with DynamoDB via Lambda-backed API or SDK.

Tables (defined in Commit 1 infra, referenced here):
- `Users` — PK: `userId` (string); attrs: `email`, `balance`, `stats` (map), `createdAt`, `updatedAt`
- `InventoryItems` — PK: `userId`, SK: `itemId`; attrs: `name`, `rarity`, `color`, `image`, `price`, `condition`, `isStatTrak`, `pattern`, `float`, `phase`, `createdAt`

Files:
- `src/services/dynamodb.ts` — DynamoDB DocumentClient helpers (`getUser`, `createUser`, `updateUserBalance`, `putInventoryItem`, `deleteInventoryItem`, `queryInventory`)
- `src/services/db.ts` — re-implement `getUserProfile`, `openCaseAndUpdateBalance`, `sellItem`, `subscribeToInventory`, `subscribeToUser`, `loginWithGoogle`, `logout` using DynamoDB + Cognito
  - Note: `subscribeToInventory`/`subscribeToUser` become polling or Lambda WebSocket/API polling since DynamoDB has no native real-time listeners like Firestore. Implement a lightweight poll (e.g., every 5s) or API Gateway WebSocket later. For now, use `useEffect` + `setInterval` poll.

Verification: `npm run lint` passes.

---

## Commit 4: API Gateway + Lambda backend

**Goal:** Move case-open/sell logic to Lambda so sensitive operations (balance deduction, item generation) are server-side, not client-side.

Lambda functions:
- `GET /crates` — proxy to CSGO-API crates.json (or cache crates in DynamoDB/S3)
- `POST /cases/open` — validate user balance, generate roll via `simulatePriceAndCondition`, deduct balance, write inventory item atomically (DynamoDB TransactWriteItems), return saved item
- `POST /inventory/sell` — delete inventory item, add price to balance (transact)
- `GET /users/{userId}` — get profile
- `GET /users/{userId}/inventory` — list inventory

Files:
- `backend/` — Lambda handler source (Node.js), `package.json`, `tsconfig.json`
- `infrastructure/` — API Gateway REST API + Lambda integrations + IAM roles (Lambda invocation, DynamoDB access)
- `src/services/api.ts` — replace direct `getCrates`/`generateCaseRoll` with `fetch` calls to API Gateway endpoints; keep `simulatePriceAndCondition` (moved to Lambda or shared layer)

Verification: `npm run lint` passes; Lambda handlers compile (`tsc --noEmit` in `backend/`).

---

## Commit 5: Frontend integration & S3 build

**Goal:** Wire pages to new API/auth; prepare for S3 deployment.

Files:
- `src/App.tsx` — use Cognito auth adapter; loading states
- `src/pages/Home.tsx` — `getCrates` now hits API Gateway `/crates`
- `src/pages/CaseOpener.tsx` — `openCaseAndUpdateBalance` hits `POST /cases/open`
- `src/pages/Inventory.tsx` — `sellItem` hits `POST /inventory/sell`; `subscribeToInventory` uses poll or WebSocket
- `src/components/Layout.tsx` — balance from Cognito user attributes / DynamoDB; sign-in via Cognito
- `vite.config.ts` — output to `dist/` for S3; optional `s3` deploy script
- `scripts/deploy-frontend.sh` — `aws s3 sync dist/ s3://<bucket> --delete` + CloudFront invalidation

Verification: `npm run build` succeeds; `npm run lint` passes.

---

## Commit 6: Deploy & smoke test

**Goal:** Provision AWS resources, deploy frontend to S3, deploy Lambda/API Gateway, run end-to-end smoke test.

Steps:
- `aws s3 mb s3://<bucket>` + enable static website hosting
- Deploy CDK/CloudFormation stack (Cognito pool, DynamoDB tables, API Gateway, Lambda)
- `npm run build` → `aws s3 sync dist/`
- Update Cognito app client callback URLs to S3/CloudFront URL
- Smoke test: sign in with Google, open case, verify inventory + balance update in DynamoDB

Verification: App reachable via S3 URL; sign-in works; case open persists to DynamoDB; sell updates balance.

---

## Order of execution

Run commits 1 → 6 sequentially. Do not delete Firebase config until Commit 4/5 confirms the AWS stack handles auth + data.

### Rollback note
Keep `firebase-applet-config.json` and `firestore.rules` untouched until the final commit, so the Firebase version remains runnable for comparison.
