# IMPORTANT — things that need your judgement

Deploying happens in GitHub Actions now, and the two blockers that made that
impossible are gone. What is left is decisions, not work I can safely guess at.
Nothing here stops the app from running today.

---

## Resolved tonight

- **Terraform state is remote.** `terraform/backend.tf` points at
  `s3://cs2-unboxed-tfstate-499867322589/cs2-unboxed/dev/terraform.tfstate`:
  versioned, AES256, all public access blocked, native `use_lockfile` locking
  (no DynamoDB table). State was migrated with `-migrate-state`.
- **AWS access no longer comes from this laptop's root session.** The workflow
  assumes `arn:aws:iam::499867322589:role/cs2-unboxed-github-deploy-dev` through
  GitHub OIDC, trusted only for `refs/heads/main` and the `production`
  environment. Repository variables `AWS_REGION`, `AMPLIFY_APP_ID`,
  `AMPLIFY_BRANCH`, `API_BASE_URL`, `FRONTEND_URL`, `COGNITO_CLIENT_ID` and the
  secret `AWS_ROLE_ARN` are set.
- **Deploy has run and passed in Actions.** Runs
  [`41888618160`](https://github.com/Andiewitz/case-opening-simulator/actions/runs/41888618160)
  (infrastructure + frontend) and
  [`41890605584`](https://github.com/Andiewitz/case-opening-simulator/actions/runs/41890605584)
  (frontend). The workflow now waits for the Amplify job before smoking the live
  site — starting a deployment returns immediately, so the old check could pass
  against the previous build.

### Two things CI taught us the hard way

- **The first CI build shipped a bundle with no API URL and no Cognito client.**
  Those values lived only in the untracked `.env.local`; every request went to
  the Amplify origin and sign-in could not refresh. Fixed by committing the
  public values as `.env.production`, and the deploy now fetches the deployed
  JavaScript and asserts the API URL and client id are inside it. A status-code
  smoke check could never have caught this.
- **Do not run `terraform apply` locally while a Deploy run is queued.** The
  workflow applies a plan file it created earlier, so it can write a stale
  resource over your newer change — that is exactly how the deploy role lost
  `cloudwatch:ListTagsForResource` mid-deploy and failed two runs.

## 1. Who is allowed to ship, and how

`Deploy` is `workflow_dispatch` only, so a human clicks it — a push-to-main
auto-deploy would put unreviewed commits in production with no gate.

**What I need from you:** pick one — (a) leave it manual (current), (b)
auto-deploy the frontend on push to `main` with infrastructure still manual, or
(c) full auto-deploy on push. For (b)/(c) I'd add a required reviewer to the
`production` environment, which needs your admin rights
(`Settings → Environments`), I can't set that for you.

## 2. The state bucket has no deletion guard

It is versioned and private, but nothing stops an operator or a bad `destroy`
from deleting it. There is no `prevent_destroy` for backends, and MFA-delete is
deprecated.

**What I need from you:** say the word and I'll add a bucket policy denying
`DeleteBucket`/`PutBucketPolicy` except root, plus a lifecycle rule keeping the
last 30 noncurrent versions.

## 3. Alarms exist but nobody is notified

Per-handler error alarms and the API 5XX alarm have **no actions**, so they only
turn red on a dashboard.

**What I need from you:** an email (or Slack/PagerDuty) destination. Then it is a
small `terraform/monitoring.tf` change with `alarm_email`.

## 4. `main` has no branch protection

Direct pushes are allowed and CI is not required, although CI now covers lint,
typecheck, 102 unit tests, build, terraform fmt/validate and the Playwright reel
test.

**What I need from you:** say go and I'll wire it with `gh api` (require those
checks, block force-pushes). That plus item 1(a) is the sane combination.

## 5. Password reset is still missing

Sign-in, sign-up and email confirmation work; there is no "forgot password"
flow, so a locked-out user has no self-service route.

**What I need from you:** (a) Cognito code by email (`ForgotPassword` →
`ConfirmForgotPassword`), reusing the existing modal and needing no new
infrastructure, or (b) a magic-link flow. I'd do (a).

## 6. The legacy S3 website origin is off

`public_website_interim = false` is applied: the bucket is private and
`http://<bucket>.s3-website-us-east-1.amazonaws.com` no longer serves the site.
Amplify is the frontend of record.

**What I need from you:** confirm nothing still points at that HTTP URL (old
bookmarks, a demo link, notes elsewhere). If something does, it is dead now.

## 7. `stable` is a tag and a branch, not a rewritten commit message

`21f7ec3` is labelled by `stable`, `backup/pre-agent` and the annotated tag
`stable-21f7ec3`. I did not amend its message because it is published history.

**What I need from you:** only if you specifically want the subject to read
`[stable] …` — then I'll rebase and force-push, with those refs as recovery.

## 8. Nine moderate npm advisories, all in the ESLint toolchain

`npm audit --audit-level=high` passes, so CI is green. Dependabot's ESLint group
PR fails both the app and e2e jobs: clearing it means ESLint 10 plus a
flat-config migration that can change lint behaviour.

**What I need from you:** upgrade now (I'll keep the rule set identical and show
any new findings) or leave it for the next dependency sweep. The narrower bumps
(jsdom, `globals`, `motion`, `setup-node`, `setup-terraform`) pass and are safe.

## 9. One product decision I made for you

`GET /users/{userId}` ignores the id in the path and always returns the token's
account — deliberate, so accounts cannot read each other. Admin views or public
profiles would have to change this contract first.

**What I need from you:** confirm that is still the intent.

## 10. Real collector prices make sticker capsules extremely profitable

`CASE_COST` is still a flat $2.50 for every crate. The Steam-price snapshot now
uses the cantry.dev collector reference for Katowice 2014 stickers because Steam
has no active listings: Reason Gaming (Holo) is $43,032.77, Titan (Holo) is
$66,479.70, and iBUYPOWER (Holo) is $63,542.67. Those stickers sit in the purple
tier of the EMS Katowice 2014 capsule, so opening that capsule for $2.50 has an
expected payout far above the weapon-case average (about $6.46). The full
snapshot P&L warning is in [docs/economy.md](docs/economy.md).

This is a real product choice, not a bug in the lookup: the item is genuinely
worth that much, and the user asked for the real value. I did not silently
change the charge.

**What I need from you:** pick one — (a) accept the generous virtual economy,
(b) add a per-crate price so collector capsules cost more, or (c) exclude the
collector-reference tier from capsule drop pools while keeping it visible in the
inventory. (b) is the most realistic; it needs a small frontend/API change
because `GET /config` currently exposes one global `caseCost`.

---

## Already decided, for the record

- Roll happens server-side; the client animates the result
  ([decisions/0001](docs/decisions/0001-server-side-rolls.md)).
- Crate pool is baked into the deployment
  ([decisions/0002](docs/decisions/0002-baked-crates-snapshot.md)).
- Steam prices are baked into the same deployment artifact. Opens never fetch
  from Steam; every item records whether its value is `steam`, `reference` or
  `estimated`.
- Password auth via raw Cognito JSON calls; hosted UI deleted
  ([decisions/0003](docs/decisions/0003-password-auth-via-cognito-json.md)).
- `sell-all` is atomic per 99-item chunk, not for the whole inventory — the
  response's `remaining` makes that recoverable.
- The reel's audio-synced timings in `CaseOpener.tsx` are untouchable; the
  Playwright test asserts the landing tile and offset, never the timing.
- `.env.production` is committed on purpose: the values are public (API URL,
  public app client) and CI has no `.env.local`. Keep it in step with
  `terraform/` if the pool or API is ever recreated.
