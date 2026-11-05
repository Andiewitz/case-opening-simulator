# Economy

Everything that decides what an open is worth lives in
`backend/src/shared/simulation.ts` (roll + valuation),
`backend/src/shared/prices.ts` (Steam quote lookup) and
`backend/src/config.ts` (caps and case price). The frontend displays numbers;
it never computes them.

## Constants

| Value | Where | Default |
|---|---|---|
| Case price | `CASE_COST` | $2.50 |
| Starting balance | `STARTING_BALANCE` | $100.00 |
| Inventory cap | `MAX_INVENTORY_ITEMS` | 500 items |
| Open cooldown | `OPEN_COOLDOWN_MS` | 400 ms (0 disables) |

The case price is exposed through `GET /config`; nothing in the UI hardcodes it.
`GET /config` also exposes `pricesAsOf` and `priceCurrency` from the baked price
snapshot.

## Price source

Case opens never call Steam. Prices come from
`backend/src/shared/prices.json.gz`, which `scripts/bake-prices.ts` builds at
release time and `scripts/build-backend.sh` copies into the Lambda package.

The snapshot is keyed by the exact Steam `market_hash_name` for the rolled
variant, so these are different entries:

- `AK-47 | Redline (Field-Tested)`
- `AK-47 | Redline (Factory New)`
- `StatTrak™ AK-47 | Redline (Field-Tested)`
- `★ StatTrak™ Karambit | Doppler (Factory New)`

Sources, in priority order:

1. **SKINSTRACK/CS2-Price-API** free snapshots for Steam lowest listings of
   skins and stickers.
2. **Gamer6MD/CS2_SkinsMarket_Price** as an older Steam fallback for names the
   first feed did not cover. It never overwrites a newer quote.
3. **cantry.dev** Katowice 2014 and Krakow 2017 collector references for old
   stickers that Steam has no active sell listing for. This is why
   `Reason Gaming (Holo) | Katowice 2014` shows a four-figure reference value
   instead of the last low Steam sale.
4. **ByMykel/CSGO-API `skins.json`** for which wears and StatTrak versions
   actually exist.

Every stored item carries `priceSource`, `priceProvider` and `priceUpdatedAt`:

| `priceSource` | Meaning |
|---|---|
| `steam` | Exact Steam Community Market listing for the rolled variant. |
| `reference` | Third-party collector reference because Steam has no active listing. |
| `estimated` | Derived: neighbouring wear scaled to the target wear, non-StatTrak quote ×2.5, Steam quote plus a pattern/phase premium, or the old rarity ladder. |

Refresh the snapshot with `npm run bake-prices`; validate it with
`npm run check:prices`. The scheduled workflow refreshes both the crate and
price snapshots weekly.

The current snapshot covers **18,092 of 19,912 possible variants (90.9%)**:
18,004 Steam quotes and 88 collector references. The remaining variants use the
labelled fallback ladder below.

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

The current baked pool has **281 crates** (42 weapon cases, 100 sticker
capsules, 139 autograph capsules) and 12,347 unique items.

**Measured on the real snapshot** (100,000 seeded rolls over the 42 weapon
cases):

| Tier | Share | Average item value | EV contribution |
|---|---|---|---|
| Mil-Spec Grade | 80.07% | $2.06 | $1.65 |
| Restricted | 15.88% | $8.69 | $1.38 |
| Classified | 3.14% | $31.86 | $1.00 |
| Covert | 0.64% | $141.30 | $0.91 |
| Rare Special Item | 0.26% | $584.62 | $1.52 |

Expected payout is about **$6.46 per $2.50 weapon case**. The old fake-price
economy was $6.74; real Steam prices happen to land close for weapon cases.

**Capsules are a different story.** Over all 281 crates the measured average is
about **$41.87 per $2.50 open**, driven by the Katowice 2014 collector references
in sticker capsules. That is a product decision, not a bug in the price lookup:
the app currently charges the same `CASE_COST` for every crate. If you want the
old tighter economy, either price capsules separately or exclude the collector
reference tier from capsule pools. The snapshot keeps the sources separate, so
either change is a small follow-up.

## Fallback base price by rarity

This ladder is only used when no exact, neighbouring-wear or non-StatTrak Steam
quote exists. Those items are stored with `priceSource: "estimated"`.

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

A second roll in `[0, 100)` picks the wear bracket and its fallback multiplier;
the float is drawn inside that bracket's real CS2 range:

| Roll | Condition | Float range | Fallback price × |
|---|---|---|---|
| ≤ 3.0 | Factory New | 0.00 – 0.07 | 1.00 |
| ≤ 24.0 | Minimal Wear | 0.07 – 0.15 | 0.85 |
| ≤ 57.0 | Field-Tested | 0.15 – 0.38 | 0.70 |
| ≤ 81.0 | Well-Worn | 0.38 – 0.45 | 0.55 |
| > 81.0 | Battle-Scarred | 0.45 – 1.00 | 0.40 |

The wear list is not invented. It comes from `skins.json`:

- An item that only exists in Minimal Wear and Field-Tested gets the nearest
  real wear when the roll lands on Factory New, Well-Worn or Battle-Scarred.
- Vanilla knives have no wear and no float; their market name is just
  `★ Bayonet`.
- StatTrak is only rolled for items that have a StatTrak version. Gloves and
  non-StatTrak skins stay normal even if the 10% roll fires.

## Modifiers

| Modifier | Trigger | Effect |
|---|---|---|
| Pattern | Every weapon: `Math.floor(rng()*1000)+1`, i.e. 1–1000 | — (cosmetic) |
| Tier 1 blue gem | Case Hardened with pattern 661, 387, 321, 670, 74, 269, 150 | ×100 |
| Tier 2 blue gem | Case Hardened with pattern 955, 92, 828, 592, 179, 310, 4 | ×20 |
| Doppler phase | Emerald / Ruby / Sapphire | ×8 |
| Doppler phase | Black Pearl | ×5 |
| StatTrak fallback | Rolled StatTrak with no exact ST quote | ×2.5 |

When a Steam quote exists, it is used as the base price. Blue-gem and Doppler
phase premiums are then applied on top, and the result is relabelled
`estimated` because Steam lists one market name for every phase. An exact
StatTrak quote is used directly; the ×2.5 fallback only applies when no
StatTrak quote exists.

Stickers, patches and graffiti have no float, pattern or condition: those fields
are `null` and StatTrak is always `false`. Their price is the exact sticker
market quote, or a collector reference.

The final price is rounded to two decimals before it is stored.

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
- A case open never fetches a price from the network. Both snapshots are baked
  into the deployment artifact and warmed by the signed-in warm-up request.
