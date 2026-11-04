# 0001 — The roll happens on the server

Status: accepted · 2026-11-04

## Context

The case-opening animation is client-side: a reel of items scrolls and lands on
the winner. The obvious implementation is to roll in the browser and POST the
result. That makes every drop, price and balance editable from devtools, and
would make the inventory meaningless the moment anyone cared.

## Decision

`backend/src/shared/simulation.ts` picks the item and prices it. The API returns
the finished item, and `CaseOpener.tsx` animates the reel to it. The client never
sends a price, a rarity or a random seed it chose; `sellItem` ignores any `price`
in the request body for the same reason.

The rng is injectable (`generateCaseRoll(crate, rng)`), which is what makes the
drop table testable and a roll replayable from a seed if support ever needs it.

## Consequences

- Every open costs a Lambda invocation and a transaction. Acceptable at this
  scale, and the client warms the path before the user clicks.
- The animation can only show what the server returned, so the winner is known
  before the reel starts. The reel is presentation, not a race.
- Changing the economy is a backend deploy — the priced copy in the UI comes from
  `GET /config`, not from the client.
