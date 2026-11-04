# IMPORTANT — things that need your judgement

Everything else is done, committed and verified. These are the decisions I
deliberately did **not** make for you, ordered by how much damage the wrong
choice could do. Nothing here is blocking the app from working today.

---

## 1. Terraform state is local, not remote — highest risk

`terraform/terraform.tfstate` lives on this machine and is gitignored. If it is
lost, Terraform no longer knows what exists, and `terraform apply` would try to
recreate DynamoDB tables, the Cognito pool and the Lambdas.

**What I need from you:** confirm a bucket/table name and a region, and I'll add
an S3 backend (`terraform/backend.tf`) plus a `terraform init -migrate-state`.

Current risk: one disk failure or accidental `git clean` away from rebuilding
production by hand.

## 2. The deploy used root AWS credentials

`aws sts get-caller-identity` returned
`arn:aws:iam::499867322589:root`. That is what applied the infrastructure and
uploaded the frontend.

**What I need from you:** decide whether to keep using `aws login` locally (fine
for a hobby project, risky for anything real). `terraform/github-oidc.tf` already
defines a scoped deploy role — set `github_repository = "Andiewitz/case-opening-simulator"`
in `terraform/terraform.tfvars`, apply once, then put that role's ARN in the
`AWS_ROLE_ARN` repository secret.

## 3. Alarms exist but nobody is notified

I added per-handler error alarms and an API 5XX alarm. They have **no actions**,
so they only turn red on a dashboard.

**What I need from you:** an email (or Slack/PagerDuty) destination. Then H6 is a
20-line `terraform/monitoring.tf` change with `alarm_email`.

## 4. `main` has no branch protection

Direct pushes are allowed and CI is not required. I did not change repository
settings — that needs your admin rights.

**What I need from you:** say the word and I'll wire it with `gh api`
(require `app`, `terraform`, `e2e` checks; block direct pushes).

## 5. Password reset is still missing

Sign-in, sign-up and email confirmation work. There is no "forgot password"
flow, so a locked-out user has no self-service route.

**What I need from you:** the UX you want —
(a) Cognito code by email (`ForgotPassword` → `ConfirmForgotPassword`), which
reuses the existing modal and needs no new infrastructure, or
(b) a magic-link flow, which needs Amplify/Cognito callback work.
I'd do (a).

## 6. The S3 website origin is now off

`public_website_interim` defaults to `false` and I applied it: the bucket is
private and the legacy `http://<bucket>.s3-website-us-east-1.amazonaws.com` URL
no longer serves the site. Amplify is the frontend of record.

**What I need from you:** confirm nothing still points at that HTTP URL (old
bookmarks, a README elsewhere, a demo link). If something does, it is dead now —
say so and I'll flip the variable back.

## 7. `stable` is a tag and a branch, not a rewritten commit message

`21f7ec3` is labelled by `stable`, `backup/pre-agent` and the annotated tag
`stable-21f7ec3`. I did not amend its message because it is the tip of
`origin/main` and rewriting it means force-pushing published history.

**What I need from you:** only if you specifically want the commit subject to
read `[stable] …` — then I'll rebase and force-push with those refs as the
recovery path.

## 8. Deploy is still manual by my hand, not by CI

`.github/workflows/deploy.yml` exists but has never run: it needs repository
variables (`AWS_REGION`, `AMPLIFY_APP_ID`, `AMPLIFY_BRANCH`, `API_BASE_URL`,
`FRONTEND_URL`, `TF_STATE_BUCKET`, `TF_STATE_KEY`) and the `AWS_ROLE_ARN` secret.

**What I need from you:** decide whether CI should own deploys (safer, auditable)
or you keep applying locally. If CI, I'll set the variables once the OIDC role
exists.

## 9. Nine moderate npm advisories remain

All in the ESLint toolchain (`minimatch` DoS). `npm audit --audit-level=high`
passes, so CI is green. Clearing them means ESLint 10 + a flat-config migration,
which can change lint behaviour.

**What I need from you:** upgrade now (I'll keep the rule set identical and show
any new findings) or leave them for the next dependency sweep.

## 10. One product decision I made for you

`GET /users/{userId}` ignores the id in the path and always returns the token's
account — deliberate, so accounts cannot read each other. If you ever want an
admin view or public profiles, this is the contract that has to change first.

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
- The reel's audio-synced timings in `CaseOpener.tsx` are untouchable; the new
  Playwright test asserts the landing tile and offset, never the timing.
