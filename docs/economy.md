# Economy

Everything that decides what an open is worth lives in
`backend/src/shared/simulation.ts` (valuation) and `backend/src/config.ts`
(prices and caps). The frontend displays numbers; it never computes them.

## Constants

| Value | Where | Default |
|---|---|---|
| Case price | `CASE_COST` | $2.50 |
| Starting balance | `STARTING_BALANCE` | $100.00 |
| Inventory cap | `MAX_INVENTORY_ITEMS` | 500 items |
| Open cooldown | `OPEN_COOLDOWN_MS` | 400 ms (0 disables) |

The price is exposed through `GET /config`; nothing in the UI hardcodes it.

## Drop table

One roll in `[0, 100)` selects the tier, then a uniform pick inside that tier:

| Band | Tier | Chance |
|---|---|---|
| `roll ≤ 0.26` | Rare Special Item (gold) — only if the crate has one | 0.26% |
| `roll ≤ 0.90` | Covert / Extraordinary | 0.64% |
| `roll ≤ 4.10` | Classified / Exotic | 3.20% |
| `roll ≤ 20.08` | Restricted / Remarkable / High Grade (Purple) | 15.98% |
| otherwise | Mil-Spec / High Grade / Industrial / Consumer / Base | 79.92% |

If a tier is empty in that crate, the roll falls through to the next band and
finally to the crate's blue pool — so a crate without a gold item never returns
one.

**Measured on the real snapshot** (200,000 seeded rolls across the 42 case-type
crates, 657 items):

| Tier | Share | Average item value |
|---|---|---|
| Mil-Spec Grade | 79.94% | $2.05 |
| Restricted | 15.99% | $6.35 |
| Classified | 3.19% | $23.75 |
| Covert | 0.64% | $123.28 |
| Rare Special Item | 0.26% | $997.57 |

The realized gold share is exactly the band because every real case has a rare
pool. The same run puts **expected payout at $6.74 per $2.50 open** — the
economy is deliberately generous, since balances are virtual and the point is
that a session is fun. Change `CASE_COST` (or the price ranges below) if you
want a tighter curve, and re-run `tests/simulation.test.ts`, which pins the
drop rates.

## Base price by rarity

| Rarity id | Range |
|---|---|
| `rarity_common` | $0.10 – $0.50 |
| `rarity_uncommon` | $0.20 – $1.00 |
| `rarity_rare` | $0.20 – $3.00 |
| `rarity_rare_weapon` | $0.50 – $5.00 |
| `rarity_mythical` | $1.00 – $10.00 |
| `rarity_mythical_weapon` | $2.00 – $15.00 |
| `rarity_legendary` | $5.00 – $30.00 |
| `rarity_legendary_weapon` | $10.00 – $50.00 |
| `rarity_ancient` (gold, and every ★ item) | $100 – $1,500 |
| Karambit / Butterfly / M9 Bayonet | $500 – $3,000 |

The base is a uniform draw inside the range, before condition and modifiers.

## Condition ladder

A second roll in `[0, 100)` picks the wear bracket and its price multiplier; the
float is drawn inside that bracket's real CS2 range:

| Roll | Condition | Float range | Price × |
|---|---|---|---|
| ≤ 3.0 | Factory New | 0.00 – 0.07 | 1.00 |
| ≤ 24.0 | Minimal Wear | 0.07 – 0.15 | 0.85 |
| ≤ 57.0 | Field-Tested | 0.15 – 0.38 | 0.70 |
| ≤ 81.0 | Well-Worn | 0.38 – 0.45 | 0.55 |
| > 81.0 | Battle-Scarred | 0.45 – 1.00 | 0.40 |

## Modifiers

| Modifier | Trigger | Multiplier |
|---|---|---|
| Pattern | Every weapon: `Math.floor(rng()*1000)+1`, i.e. 1–1000 | — (cosmetic) |
| Tier 1 blue gem | Case Hardened with pattern 661, 387, 321, 670, 74, 269, 150 | ×100 |
| Tier 2 blue gem | Case Hardened with pattern 955, 92, 828, 592, 179, 310, 4 | ×20 |
| Doppler phase | Emerald / Ruby / Sapphire | ×8 |
| Doppler phase | Black Pearl | ×5 |
| StatTrak | 10% of weapon rolls | ×2.5 |

Stickers, patches and graffiti have no float, pattern or condition: those fields
are `null` and StatTrak is always `false`.

Multipliers compose (blue gem inside a Doppler-shaped item would stack), and the
final price is rounded to two decimals before it is stored.

## Guarantees the code enforces

- The roll happens on the server; the client receives the result and animates
  to it.
- Charging, item creation and stat/counter updates are one transaction. The
  condition `balance >= :cost` is what prevents an overdraw — the earlier
  read-then-write check is only a friendly fast path.
- Selling credits the **stored** price, and the delete is conditional, so an
  item can be sold exactly once.
- Holding more than `MAX_INVENTORY_ITEMS` is rejected (`409 INVENTORY_FULL`), and
  opens closer together than `OPEN_COOLDOWN_MS` are rejected (`429 TOO_FAST`).
