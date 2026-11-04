# Runbook

Operational procedures for the deployed stack: AWS account, Terraform in
`terraform/`, API Gateway + Lambda, two DynamoDB tables, Cognito, Amplify.

## Where things live

| Thing | Where |
|---|---|
| Logs | CloudWatch `/aws/lambda/cs2-unboxed-<handler>-<env>`, 7-day retention |
| Log shape | one JSON line per event: `level`, `name`, `requestId`, `route`, fields |
| Alarms | `<app>-<handler>-<env>-errors` (Lambda errors, 5 min) and `<app>-api-<env>-5xx` |
| API URL | `terraform output api_gateway_invoke_url` |
| Frontend URL | `terraform output amplify_default_domain` |
| State | remote S3 backend (see `terraform/backend.tf.example`); no state is committed |

Useful CloudWatch Logs Insights query:

```
fields @timestamp, name, requestId, userId, message
| filter level = "error"
| sort @timestamp desc
| limit 50
```

## Deploy

Frontend + backend:

```sh
npm ci
npm run build            # dist/
npm run build:backend    # backend/dist/ (terraform zips this)
cd terraform && terraform apply
```

Then upload `dist/` to Amplify (`aws amplify create-deployment` +
`start-deployment`, which `.github/workflows/deploy.yml` automates), or run the
Deploy workflow with `deploy_infrastructure: true` to do both.

Order matters: `terraform apply` reads `backend/dist`, so build first. If you
forget, `data.archive_file` zips a stale or missing directory and the Lambdas
serve old code or fail to start.

### Smoke check after a deploy

```sh
curl -sI  "$API/crates"  | grep -i content-encoding   # expect gzip
curl -s   "$API/config"  | head -c 200                # expect JSON with caseCost
curl -s -o /dev/null -w '%{http_code}\n' "$FRONTEND/inventory"   # expect 200, not 404
```

`/inventory` returning 404 means the Amplify SPA rewrite rule is missing — the
site works until someone refreshes a deep link.

## Refresh the crates snapshot

The pool is baked at build time; nothing is fetched at runtime.

```sh
npm run bake-crates      # rewrites backend/src/shared/crates.json.gz
npm run check:crates     # parses it and reports count + age
npm run build:backend && (cd terraform && terraform apply)
```

`refresh-crates.yml` does the first step weekly and opens a PR. Merge it, then
deploy. CI fails when the snapshot is older than 120 days, so a stalled PR
cannot rot silently.

## Roll back

- **Frontend** — re-run the Deploy workflow on the last good commit (Amplify
  keeps previous jobs; you can also redeploy an older job in the Amplify
  console).
- **Lambda** — `git checkout <good-sha> -- backend/src`, then
  `npm run build:backend && terraform apply`. Every handler shares one zip, so a
  rollback moves all of them together. Versioned Lambda snapshots are not kept
  by this configuration; the artifact is the git history.
- **Data** — there are no backups configured. Point-in-time recovery is the
  thing to enable before this carries anything that matters
  (`aws dynamodb update-continuous-backups`).

## Common failures

| Symptom | Likely cause | Check |
|---|---|---|
| Every request 401 | Expired token, wrong `VITE_COGNITO_CLIENT_ID`, or the Lambda lost `cognito-idp:GetUser` | browser network tab; `logFailure` lines with `Invalid or expired token` |
| 403 on open/sell only | `Origin` not in `ALLOWED_ORIGINS` | `ALLOWED_ORIGINS` on the Lambda; it must contain the exact Amplify origin |
| 502 on `/crates` | `crates.json.gz` missing from the Lambda zip | `aws lambda get-function` → download, or `logFailure` `get_crates_degraded` |
| 500 on every open | DynamoDB table names or permissions | `open_case_failed` lines; `TABLE_USERS`/`TABLE_INVENTORY` env vars |
| 409 `CONFLICT` often | Genuine concurrency (double-click, two tabs) | expected; the client retries |
| 429 `TOO_FAST` | `OPEN_COOLDOWN_MS` too high for the animation | compare with `CaseOpener` timing |
| Sign-in works, balance never loads | `/users/{id}` failing | the browser keeps the cached identity and logs `Profile refresh failed` |

## Terraform

- Never commit `terraform.tfstate*` or `.terraform/`. State lives in S3.
- `terraform init -backend=false && terraform validate` needs no credentials —
  that is what CI runs.
- If state is lost: restore the S3 object version, or `terraform import` the
  resources (Cognito pool and DynamoDB tables first — importing those without
  the right names creates duplicates).
- `public_website_interim` now defaults to **false**. Applying it removes the
  public-read bucket policy and the S3 website configuration; the frontend is
  served by Amplify. Set it back to `true` only to resurrect the legacy HTTP
  origin deliberately.
- `enable_cloudfront` stays `false` until the account verification clears; see
  [aws-cloudfront-verification.md](aws-cloudfront-verification.md).

## CI

`.github/workflows/ci.yml` — lint, typecheck, tests, frontend build, Lambda
bundles, crates freshness, `npm audit --audit-level=high`, terraform
fmt/validate. `.github/workflows/deploy.yml` — manual, `production` environment
with reviewers, OIDC to AWS, no long-lived keys. `.github/workflows/refresh-crates.yml` —
weekly snapshot PR.

Repository setup the workflows expect: variables `AWS_REGION`,
`AMPLIFY_APP_ID`, `AMPLIFY_BRANCH`, `API_BASE_URL`, `FRONTEND_URL`,
`TF_STATE_BUCKET`, `TF_STATE_KEY`; secret `AWS_ROLE_ARN` (trust policy in
`terraform/iam.tf` would need to be added before first use).
