# Testing

`npm test` runs Vitest over `tests/**/*.test.ts`. No AWS account, credentials or
network access is needed. The suite is deliberately narrow: it covers the money
path, the drop rates and the browser token handling, not every component.

```sh
npm test              # all suites, one run
npm run test:watch    # watch mode
npx vitest run tests/openCase.test.ts   # one file
npm run check         # lint + typecheck + test + build (same as CI)
```

## Layout

| File | Covers | Plan id |
|---|---|---|
| `tests/simulation.test.ts` | drop table + band boundaries, 200k-roll rate check, condition ladder, blue gems, Doppler, StatTrak, stickers | T1–T3 |
| `tests/cratesData.test.ts` | feed projection, CDN-prefix stripping, baked snapshot integrity | T4 |
| `tests/openCase.test.ts` | auth/validation, happy path, insufficient balance, inventory full, warm-up, concurrency, throttle, origin checks | T5 |
| `tests/inventory.test.ts` | sell (stored price, double-sell, other users), inventory pagination, profile seeding/repair, sell-all | T6 |
| `tests/auth.test.ts` | JWT decoding, sign-in error mapping, single-flight refresh, sign-out, auth event stream | T7 |
| `tests/http.test.ts` | CORS/preflight, `/config`, both `/crates` serving paths | — |
| `tests/helpers/fakeDynamo.ts` | in-memory DynamoDB | — |
| `tests/helpers/harness.ts` | installs the mocks, builds API Gateway events | — |
| `tests/helpers/fixtures.ts` | test crates + rng helpers | — |

## How the AWS mocks work

`aws-sdk-client-mock` patches the client **class** prototypes, and the handlers
build their clients once at module load — so the singletons still route through
the fake. `createHarness()` registers `GetCommand`, `PutCommand`,
`UpdateCommand`, `DeleteCommand`, `QueryCommand` and `TransactWriteCommand`
against `FakeDynamo`, and `GetUserCommand` against Cognito (always resolving to
`user-1` unless `authAs("user-2")` is used).

`FakeDynamo` is a small but real evaluator, not a stub: it parses the actual
expression strings the handlers send.

- Conditions: `AND`/`OR`, parentheses, `attribute_exists`, `attribute_not_exists`,
  `>= <= > < = <>` against `:values`.
- Updates: `ADD` (numeric increments, including nested paths such as
  `stats.casesOpened`) and `SET`, comma-separated.
- Queries: `KeyConditionExpression`, `Limit`, `ExclusiveStartKey`,
  `ScanIndexForward`, `Select: "COUNT"`.
- Transactions: all-or-nothing, raising `TransactionCanceledException` with
  `CancellationReasons` when any condition fails.

This is why `tests/openCase.test.ts` can fire ten concurrent opens and assert
that exactly two succeed: the fake re-evaluates the guard per transaction
exactly as DynamoDB would.

Because the fake enforces conditions rather than recording calls, a test that
passes proves the expression string is right, not merely present.

## Deterministic rolls

`generateCaseRoll(crate, rng)` and `simulatePriceAndCondition(item, special, rng)`
take an optional `rng` defaulting to `Math.random`. `tests/helpers/fixtures.ts`
provides:

- `fixedRng(v)` — every call returns `v`.
- `sequenceRng(...values)` — returns each value in order, repeating the last.
- `seededRng(seed)` — a small deterministic LCG for distribution tests.

rng call order matters: band → item index → price → condition → float → pattern
→ StatTrak. When a test needs an exact item, seed the first value with
`percent / 100` (the implementation multiplies by 100) and remember that
floating-point products can land a hair above a band boundary — assert just
inside the boundary, as `simulation.test.ts` does.

## Adding a test

- **New handler** — add it to `tests/helpers/harness.ts` only if it needs a new
  command; otherwise import it and call it with `apiEvent({...})`.
- **New crate logic** — extend `FIXTURE_CRATES`/`FIXTURE_CRATE` in
  `tests/helpers/fixtures.ts` rather than pulling in the real 992 KB snapshot.
- **Money or drop-rate change** — this is the one rule that is not negotiable:
  the change ships with a test that fails without it. `openCase.test.ts`'s
  concurrency case and `simulation.test.ts`'s 200k-roll case are the templates.

## Environment

`tests/setup.ts` sets the backend's table names, `ALLOWED_ORIGINS` and
`OPEN_COOLDOWN_MS=0` before any module loads, and installs an in-memory
`localStorage` (Node 26 defines a global `localStorage` that is `undefined`
unless the process is started with `--localstorage-file`, which otherwise
shadows jsdom's). jsdom is the runner environment for every suite.

## What is not covered

No component rendering tests and no end-to-end browser run. The reel timing in
`CaseOpener.tsx` (audio-synced, deliberately fragile) is the one place where a
Playwright smoke test against a stubbed API would add real value; it is listed
as optional follow-up work in `docs/plan.md`, not implemented.
