---
name: tenureiq-domain
description: UK property investment, HMO, AASC, and property finance domain knowledge for TenureIQ. Use whenever writing code that touches property values, mortgages, yields, LTV, ICR, SDLT, MEES, HMO licensing, AASC placements, Clearsprings/Serco workflows, Local Housing Allowance, Section 24 tax, or any calculation that depends on UK property law. Trigger when the user mentions any of: HMO, AASC, Clearsprings, Serco, LHA, BRMA, MEES, EPC, EICR, Article 4, SDLT, Section 24, LACORS, ICR, LTV, yield, rental, buy-to-let, BTL, property portfolio, landlord, tenancy, AST, dispersal accommodation, asylum housing. Also use when working in the TenureIQ codebase regardless of phrasing.
---

# TenureIQ Domain Knowledge

This skill encodes UK property investment, HMO management, and AASC (Asylum Accommodation Support Contract) domain rules. Read this before writing any code that depends on these rules, and consult the relevant reference file when implementing the calculation.

## When to load deeper references

| Working on... | Read |
|---|---|
| SDLT calculations, 6+ dwelling purchases, stamp duty | `references/sdlt.md` |
| EPC, MEES, F/G blocker logic | `references/mees.md` |
| HMO licensing, LACORS sizing, Article 4 | `references/hmo-licensing.md` |
| Section 24, individual vs corporate landlord tax | `references/section24.md` |
| ICR, stressed LTV, refinance headroom, BTL lender stress tests | `references/finance-stress-tests.md` |
| Clearsprings/Serco placements, AASC areas, LHA+40% rule | `references/aasc.md` |
| LHA rates, BRMA, SAR, room-only rates | `references/lha.md` |
| Compliance certificate expiry rules (gas, EICR, EPC, etc) | `references/compliance.md` |

## Hard facts that drive code (memorise, do not negotiate)

### Money and rates
- **All monetary values are stored as `bigint` in pence.** A £150,000 mortgage is `15000000n`. Convert at the UI boundary only.
- **Interest rates are stored as `int` basis points.** 5.25% is `525`. Never store rates as floats.
- **Dates without time** (tenancy start, EPC expiry, valuation date) are SQL `date`. Audit timestamps are `timestamptz`.

### Clearsprings — South England and Wales
- Pays accommodation providers up to **LHA Shared Accommodation Rate + 40%** for dispersal accommodation (HMO/shared).
- This is the single most-mistaken fact in casual write-ups. Anything claiming "Clearsprings pays at or below SAR" is wrong.
- Landlord enquiry line: `01225 460 001`.
- Their open/closed area status is not published in the same way Serco's is — instead, work from the **Clearsprings demand-gap dataset** (see `data/clearsprings-demand-gaps.json`).

### Serco — North West, Midlands, East of England
- Area procurement statuses: **OPEN**, **LIMITED**, **CLOSED**.
- Source of truth: `data/serco-areas.json` (seeded from Serco procurement PDF dated 12/03/26).
- A property in a CLOSED area cannot be placed regardless of suitability. Surface this in the UI early.

### MEES — Minimum Energy Efficiency Standards
- EPC rating of **E or better** is required to grant a new tenancy on a domestic property.
- F and G are a **legal letting blocker** (LET_BLOCKED status in TenureIQ). Surface as a hard warning, not a soft one.
- Government is consulting on raising the minimum to **C by 2030** for new tenancies, 2028 for existing. Keep this as a config flag (`mees.minimum_band`), not a hardcoded rule.

### HMO licensing
- **Mandatory licence**: 5+ unrelated persons forming 2+ households. National rule.
- **Additional licensing**: variable scope, set by individual LAs. Cannot be inferred from property data — must be stored at the property record.
- **Selective licensing**: applies to single-family lets in designated areas. Same — store, don't infer.
- All three are 5-year maximum duration. Renewal triggers full re-application.

### Section 24 (since 2017)
- Individual landlords **cannot deduct mortgage interest** from rental income. They receive a 20% tax credit on the interest instead.
- Corporate landlords (Ltd companies) are **unaffected** — they deduct interest as a normal business expense.
- This is the single biggest reason HMO landlords incorporate. Reflect it in the entity-level P&L logic.

### SDLT — 6+ dwellings election
- A transaction acquiring **6 or more residential dwellings** can be **elected as non-residential** for SDLT purposes.
- Non-residential SDLT rates are lower than residential + additional dwelling supplement.
- Multiple Dwellings Relief (MDR) was **abolished June 2024** — do not implement it.
- Surface side-by-side comparison (residential vs non-residential election) on property purchases of 6+.

### LACORS HMO sizing (kitchen, bedrooms)
- Minimum room sizes by occupant count are set in LACORS guidance (still the de-facto standard).
- A kitchen serving 5+ occupants typically needs **≥7 m²** to satisfy most LAs. Code this as a warning, not a block, since LA variance exists.

### Article 4 Direction
- Removes permitted development right to convert C3 (dwellinghouse) to C4 (small HMO, 3-6 occupants).
- Where in force, **planning permission required** for any C3→C4 change.
- Store at property level (`article_4_area bool`). Some LAs publish maps; do not attempt to compute.

## Core calculations

These are pure functions. Implement in `lib/domain/<topic>.ts` with Vitest specs. The reference docs contain the formulas and edge cases.

```ts
// lib/domain/equity.ts
equity(valuationPence, balancePence) = valuationPence - balancePence
ltv(balancePence, valuationPence) = balancePence / valuationPence  // 0..1 ratio
stressedLtv(balance, valuation, stressBps = 200) // for refinance headroom

// lib/domain/yield.ts
grossYield(annualRentPence, valuationPence)
netYield(annualRentPence, annualCostsPence, valuationPence)
roiOnCashIn(annualNetProfitPence, cashInvestedPence)  // deposit + fees + refurb

// lib/domain/icr.ts
icr(monthlyRentPence, monthlyInterestAtStressRatePence)
// BTL lenders: ≥125% basic-rate, ≥145% higher-rate. Encode both thresholds.

// lib/domain/sdlt.ts
sdltResidential(pricePence, isAdditional, isCompany)
sdltNonResidential(pricePence)
sdltSixPlusComparison(pricePence, dwellingCount)  // returns both, recommends cheaper

// lib/domain/section24.ts
effectiveTaxIndividual(grossRent, mortgageInterest, otherCosts, marginalRate)
effectiveTaxCompany(grossRent, mortgageInterest, otherCosts, ctRate)

// lib/domain/mees.ts
isLetBlocked(epcBand: 'A'|'B'|'C'|'D'|'E'|'F'|'G')  // F and G = true

// lib/domain/lha.ts
lhaRate(brmaCode, beds: 'SAR'|'1B'|'2B'|'3B'|'4B', effectiveDate)

// lib/domain/aasc.ts
sercoAreaStatus(localAuthority): 'open'|'limited'|'closed'|'unknown'
clearspringsDemandGap(localAuthority): number | null
clearspringsMaxRate(brmaCode, beds): bigint  // = SAR * 1.40
```

## Status enums (use these exact strings — do not invent)

```ts
type EntityKind = 'ltd' | 'llp' | 'individual' | 'spv'
type PropertyKind = 'hmo' | 'single_let' | 'block' | 'commercial' | 'development' | 'land'
type HmoLicenceKind = 'none' | 'mandatory' | 'additional' | 'selective'
type UnitStatus = 'occupied' | 'vacant' | 'reserved' | 'maintenance' | 'offline'
type TenancyKind = 'ast' | 'licence' | 'aasc_placement' | 'company_let' | 'holiday_let'
type AascContractor = 'clearsprings' | 'serco'
type MortgageProduct = 'fixed' | 'tracker' | 'svr' | 'discount' | 'bridging' | 'development'
type ValuationKind = 'estimate' | 'estate_agent' | 'red_book' | 'refinance' | 'purchase' | 'desktop'
type ComplianceKind = 'gas_safety' | 'eicr' | 'epc' | 'hmo_licence' | 'fire_alarm' | 'emergency_lighting' | 'pat' | 'legionella' | 'insurance' | 'asbestos' | 'fire_risk_assessment' | 'other'
type SercoAreaStatus = 'open' | 'limited' | 'closed' | 'unknown'
```

## Reference data

Seed the database from these committed JSON files — never hardcode in TypeScript:

- `data/serco-areas.json` — OPEN/LIMITED/CLOSED status by local authority
- `data/clearsprings-demand-gaps.json` — demand-pending bed counts by area
- `data/lha-rates-sample.json` — sample LHA rates for seed BRMAs

## Anti-patterns (refuse to do these)

1. Storing money as `numeric` or `float`. Always `bigint` pence.
2. Computing `ltv` as `balance / value` where either is a float-typed pound figure.
3. Hardcoding LHA rates or AASC area data in source files.
4. Treating MDR as live tax relief — it was abolished June 2024.
5. Assuming Clearsprings rates ≤ LHA SAR. The correct ceiling is SAR + 40%.
6. Inferring HMO additional licensing from postcode — it must be explicit.
7. Marking an EPC-F property as lettable. F and G are LET_BLOCKED.
