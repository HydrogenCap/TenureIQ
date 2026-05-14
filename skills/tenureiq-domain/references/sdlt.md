# SDLT — Stamp Duty Land Tax (England & NI)

Read this when implementing or modifying SDLT calculations in `lib/domain/sdlt.ts`.

## Current residential rates (post-April 2025, individual buyer, not first-time buyer, single dwelling)

| Band | Rate |
|---|---|
| £0 – £125,000 | 0% |
| £125,001 – £250,000 | 2% |
| £250,001 – £925,000 | 5% |
| £925,001 – £1,500,000 | 10% |
| £1,500,001+ | 12% |

## Higher-rate additional dwellings supplement
- **+5 percentage points** on every band when buying an additional residential dwelling.
- Applies to companies buying any residential dwelling (no relief).
- Applies to individuals already owning a residential property.

## 15% flat rate
- Applies to companies buying residential property worth more than £500,000 where the property is for personal use of a connected individual (not relevant for genuine BTL).

## Non-residential rates (commercial or mixed-use)
| Band | Rate |
|---|---|
| £0 – £150,000 | 0% |
| £150,001 – £250,000 | 2% |
| £250,001+ | 5% |

## 6+ dwellings non-residential election (the rule that matters for HMO investors)

A single transaction acquiring **6 or more residential dwellings** can be elected as non-residential. The buyer chooses whichever computation is more favourable.

Worked example for a 19-flat Cheltenham block at £1,795,000:

**Option A — residential with additional dwelling supplement (company buyer):**
- £0 – £125k @ 5% = £6,250
- £125k – £250k @ 7% = £8,750
- £250k – £925k @ 10% = £67,500
- £925k – £1,500k @ 15% = £86,250
- £1,500k – £1,795k @ 17% = £50,150
- **Total: £218,900**

**Option B — non-residential (6+ dwelling election):**
- £0 – £150k @ 0% = £0
- £150k – £250k @ 2% = £2,000
- £250k – £1,795k @ 5% = £77,250
- **Total: £79,250**

**Saving from election: ~£139,650.** This is the kind of figure that justifies the entire 6+ election surface in TenureIQ.

## Multiple Dwellings Relief (MDR) — DO NOT IMPLEMENT
- MDR was **abolished by Finance Act 2024**, with effect from **1 June 2024**.
- Any historical guide showing MDR examples is now wrong.
- Do not include MDR in the SDLT comparison view.

## First-time buyer relief
- Up to £425,000 of consideration is 0% for genuine first-time buyers (single dwelling, owner-occupier).
- Out of scope for TenureIQ investor users; do not surface.

## Implementation notes

```ts
// lib/domain/sdlt.ts skeleton

type SdltInput = {
  pricePence: bigint
  dwellingCount: number  // 1 by default
  buyerKind: 'individual_first_property' | 'individual_additional' | 'company'
}

type SdltResult = {
  totalPence: bigint
  effectiveRateBps: number
  breakdown: Array<{ bandFromPence: bigint; bandToPence: bigint; ratePct: number; taxPence: bigint }>
}

export function sdltResidential(input: SdltInput): SdltResult { /* ... */ }
export function sdltNonResidential(pricePence: bigint): SdltResult { /* ... */ }

export function sdltSixPlusComparison(input: SdltInput): {
  residential: SdltResult
  nonResidentialElection: SdltResult | null  // null if dwellingCount < 6
  recommended: 'residential' | 'non_residential'
  savingPence: bigint
} { /* ... */ }
```

## Edge cases for the test spec

1. Price exactly on a band boundary (£125,000.00, £250,000.00) — assert that the lower band closes at and including the threshold per HMRC convention.
2. £0 price (gift) — should produce £0 tax, not error.
3. 5 dwellings — non-residential election must return `null`.
4. 6 dwellings — non-residential election active.
5. Company buyer — additional dwelling supplement applies on residential calc.
6. Mixed-use property (residential + commercial in same transaction) — treat entirely as non-residential per HMRC rules.

## Disclaimers to surface in UI

The output is an estimate. Real SDLT depends on legal definitions (linked transactions, multiple buyers, mixed-use boundaries) that require a conveyancer's input. Always show: "This is an estimate. Confirm with your conveyancer before exchange."
