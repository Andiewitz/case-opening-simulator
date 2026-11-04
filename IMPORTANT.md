# IMPORTANT — things that need your judgement

Deploying now happens in GitHub Actions, and the two blockers that made that
impossible are gone (details under "Resolved"). What is left is decisions, not
work I can safely guess at. Nothing here stops the app from running today.

---

## Resolved tonight

- **Terraform state is remote.** `terraform/backend.tf` points at
  `s3://cs2-unboxed-tfstate-499867322589/cs2-unboxed/dev/terraform.tfstate`:
  versioned, AES256, all public access blocked, native `use_lockfile` locking
  (no DynamoDB table). State was migrated with `-migrate-state`; the old local
  file is gone (`terraform.tfstate.backup` is the pre-migration copy).
- **AWS access no longer comes from your laptop's root session.** The workflow
  assumes `arn:aws:iam::499867322589:role/cs2-unboxed-github-deploy-dev` via
  GitHub OIDC, trusted only for `refs/heads/main` and the `production`
  environment. The first run proved root had been masking a permission gap:
  `cloudwatch:ListTagsForResource` was missing from the role, so `terraform
  plan` failed with AccessDenied until it was added.
- **Deploy workflow has run and passed.** Run
  [`41888618160`](https://github.com/Andiewitz/case-opening-simulator/actions/runs/41888618160):
  build → OIDC role → `terraform plan` (0 add, 8 change) → apply → Amplify job
  `SUCCEED` → smoke checks (`frontend 200`, `spa route 200`, gzip `/crates`,
  `/config`). It also now waits for the Amplify job before smoking, instead of
  checking the previous build.
- Repository variables `AWS_REGION`, `AMPLIFY_APP_ID`, `AMPLIFY_BRANCH`,
  `API_BASE_URL`, `FRONTEND_URL` and the secret `AWS_ROLE_ARN` are set.

## 1. Who is allowed to ship, and how

Today `Deploy` is `workflow_dispatch` only, so a human clicks it — I kept that
because a push-to-main auto-deploy would put unreviewed commits in production
with no gate.

**What I need from you:** pick one —
(a) leave it manual (current),
(b) auto-deploy the frontend on every push to `main`, infrastructure still
manual, or
(c) full auto-deploy on push.
For (b)/(c) I'd also add a required reviewer to the `production` environment;
that needs your admin rights (`Settings → Environments`), I can't set it for you.

## 2. The state bucket has no deletion guard

It is versioned and private, but nothing stops `terraform destroy`-style
mistakes or an operator deleting the bucket. There is no `prevent_destroy` for
backends, and MFA-delete is deprecated.

**What I need from you:** say the word and I'll add a bucket policy denying
`DeleteBucket`/`PutBucketPolicy` except for root, plus a lifecycle rule keeping
the last 30 noncurrent versions. It costs nothing and is the difference between
a bad afternoon and a rebuild from scratch.

## 3. Alarms exist but nobody is notified

Per-handler error alarms and the API 5XX alarm have **no actions**, so they only
turn red on a dashboard.

**What I need from you:** an email (or Slack/PagerDuty) destination. Then it's a
small `terraform/monitoring.tf` change with `alarm_email`.

## 4. `main` has no branch protection

Direct pushes are allowed and CI is not required, even though CI now covers
lint, typecheck, 86 unit tests, build, terraform fmt/validate and the Playwright
reel test.

**What I need from you:** say go and I'll wire it with `gh api` (require those
three checks, block force-pushes). Merging that with item 1(a) is the sane
combination.

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

---

## Already decided, for the record

- Roll happens server-side; the client animates the result
  ([decisions/0001](docs/decisions/0001-server-side-rolls.md)).
- Crate pool is baked into the deployment
  ([decisions/0002](docs/decisions/0002-baked-crates-snapshot.md)).
- Password auth via raw Cognito JSON calls; hosted UI deleted
  ([decisions/0003](docs/decisions/0003-password-auth-via-cognito-json.md)).
- `sell-all` is atomic per 99-item chunk, not for the whole inventory — the
  response's `remaining` makes that recoverable.
- The reel's audio-synced timings in `CaseOpener.tsx` are untouchable; the
  Playwright test asserts the landing tile and offset, never the timing.
