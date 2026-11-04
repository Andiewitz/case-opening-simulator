# 0003 — Password auth via raw Cognito calls, no hosted UI

Status: accepted · 2026-11-04

## Context

Two auth paths existed at once: an in-app `AuthModal` that posts to Cognito's
JSON API (`InitiateAuth` with `USER_PASSWORD_AUTH`), and a hosted-UI flow
(`signIn` → Cognito `/oauth2/authorize` → `/callback` → `completeSignIn`) plus
`@aws-sdk/client-cognito-identity-provider` in the browser bundle. Only the modal
was wired to a button; the hosted path still shipped ~150 KB gzip of SDK and a
route nobody could reach.

## Decision

Keep the in-app password flow, implemented with `fetch` against
`https://cognito-idp.<region>.amazonaws.com/` and the `X-Amz-Target` header, and
delete the hosted-UI path (`src/pages/Callback.tsx`, `/callback` route, `signIn`,
`completeSignIn`, `getUserProfileFromCognito`, the SDK dependency). Sign-out is a
plain `GlobalSignOut` POST; the refresh token is exchanged at
`https://<domain>/oauth2/token`, which is why the Cognito domain stays configured.

This is why the two `VITE_COGNITO_REDIRECT_URI` / `VITE_COGNITO_LOGOUT_URI`
variables were removed: nothing reads them any more.

## Consequences

- The browser bundle dropped from 579 kB / 184 kB gzip to 430 kB / 138 kB gzip,
  under Vite's warning threshold, with no AWS SDK in shipped code.
- Password sign-up/confirm/reset is ours to build. Sign-up and confirmation
  exist in the modal; password reset does not (listed as a known gap in the
  README).
- Google federation (sketched in `terraform/variables.tf`) would need the hosted
  UI or a manual federation dance; it is not enabled and no doc promises it.
- Cognito's error names (`NotAuthorizedException`, `UserNotConfirmedException`,
  …) are mapped to readable messages in `friendlyAuthError`, and the mapping is
  covered by `tests/auth.test.ts`.
