# LHA — Local Housing Allowance

Read when implementing LHA rate lookup or AASC rate calculations.

## What LHA is

LHA is the housing benefit rate used to cap Universal Credit and Housing Benefit housing element. It is set by BRMA (Broad Rental Market Area) and bedroom category, and republished annually (April).

## Bedroom categories

| Code | Meaning |
|---|---|
| `SAR` | Shared Accommodation Rate — single adult under 35 in shared housing |
| `1B` | 1 bedroom, self-contained |
| `2B` | 2 bedroom |
| `3B` | 3 bedroom |
| `4B` | 4 bedroom (cap — there is no separate 5B+ rate) |

For HMO rooms, **SAR is the applicable rate per occupant** unless the occupant qualifies for self-contained (over 35, family, disability, etc).

## BRMA structure

A BRMA can span multiple local authorities. Cheltenham sits in the "Cheltenham" BRMA. Witney sits in the "Oxford" BRMA. The mapping is set by VOA (Valuation Office Agency).

Store BRMA as a code on properties (`brma_id`) and resolve at runtime via `lha_rates`.

## Rate freshness

LHA rates were frozen 2020–2023, then unfrozen for 2024 to the 30th percentile of local rents, then frozen again for 2025. Track the freshness explicitly:

```ts
type LhaRate = {
  brmaCode: string
  beds: 'SAR' | '1B' | '2B' | '3B' | '4B'
  weeklyPence: bigint
  effectiveFrom: string  // ISO date
  effectiveTo: string | null  // null = current
}

export function lhaRate(brmaCode: string, beds: LhaRate['beds'], asOf: Date): LhaRate | null {
  // returns the row where effectiveFrom <= asOf < (effectiveTo ?? +∞)
}
```

## Clearsprings rate ceiling

```ts
// lib/domain/aasc.ts
export function clearspringsMaxRate(sarWeeklyPence: bigint): bigint {
  // SAR * 1.40
  return (sarWeeklyPence * 14000n) / 10000n
}

export function clearspringsMaxMonthlyPence(sarWeeklyPence: bigint): bigint {
  // weekly * 52 / 12 — common British convention for monthly conversion
  return (clearspringsMaxRate(sarWeeklyPence) * 52n) / 12n
}
```

Use `weekly * 52 / 12` not `weekly * 4.33` — the former is the standard housing-benefit conversion.

## Seed data structure

`data/lha-rates-sample.json`:

```json
[
  {
    "brmaCode": "cheltenham",
    "beds": "SAR",
    "weeklyPence": 9500,
    "effectiveFrom": "2025-04-01",
    "effectiveTo": null
  },
  {
    "brmaCode": "cheltenham",
    "beds": "1B",
    "weeklyPence": 14250,
    "effectiveFrom": "2025-04-01",
    "effectiveTo": null
  }
]
```

Note: these are illustrative figures only. Real rates must be loaded from the official VOA dataset. Surface a banner in the admin LHA management page if the latest `effectiveFrom` is more than 14 months stale.

## Anti-patterns

1. Hardcoding LHA rates in TS source — always seed from JSON or admin-managed table.
2. Using a single annual rate without checking `effectiveFrom`/`effectiveTo`.
3. Computing monthly as `weekly * 4` or `weekly * 4.33` — use `weekly * 52 / 12`.
4. Assuming LHA applies to all HMO rooms — if a room has a self-contained kitchen and bathroom, 1B may apply, not SAR.
