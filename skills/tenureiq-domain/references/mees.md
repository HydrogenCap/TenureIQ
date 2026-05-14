# MEES — Minimum Energy Efficiency Standards

Read when implementing `lib/domain/mees.ts` or any EPC-aware logic.

## Current rules (Domestic Private Rented Sector, England & Wales)

- Minimum EPC rating to **grant a new tenancy**: **E**
- Minimum to **continue an existing tenancy** (since 1 April 2020): **E**
- **F and G are unlettable** unless a valid exemption is registered on the PRS Exemptions Register.

## Penalty exposure
- £5,000 per property for a breach lasting less than 3 months
- £10,000 per property for 3+ months
- Local authorities enforce; fines are issued per property per breach, not per tenant.

## Coming changes (stay configurable)
- Government has consulted on raising minimum to **C for new tenancies by 2028, all tenancies by 2030**.
- Implementation is uncertain. Reflect via config (`mees.minimum_band` default `'E'`).

## TenureIQ enforcement

```ts
// lib/domain/mees.ts
export type EpcBand = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

const BAND_ORDER: EpcBand[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export function isLetBlocked(band: EpcBand, minimum: EpcBand = 'E'): boolean {
  return BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(minimum)
}

export function meesStatus(band: EpcBand, expiryDate: string | null, minimum: EpcBand = 'E') {
  if (!expiryDate) return 'epc_missing'
  if (new Date(expiryDate) < new Date()) return 'epc_expired'
  if (isLetBlocked(band, minimum)) return 'let_blocked'
  return 'compliant'
}
```

## UI surfacing

- Property card: red badge "LET BLOCKED — EPC F" or "EPC EXPIRED".
- Property detail: prominent banner above the fold with status, current band, and remediation cost estimate (if available).
- Dashboard tile: count of properties at MEES risk.
- Compliance module: an EPC compliance item exists per property; status auto-computed.

## Common refurb routes from F/G to E or higher

This is investor-relevant context. Surface as guidance only, not advice:

1. Loft insulation top-up (cheapest typical win, ~£0.5k–£2k)
2. Cavity wall insulation if not present and suitable construction
3. LED lighting throughout
4. New efficient boiler (~£2k–£4k)
5. Heating controls (TRVs, smart thermostat)
6. Solid wall insulation (expensive — last resort, £8k–£15k)

A property's PAS 2035 retrofit report (if held) gives a specific cost-effective package.

## Exemptions (PRS Register)

Lawful exemptions include:
- All relevant improvements made (best available rating won't reach E)
- High-cost (works would exceed £3,500 with no available funding)
- Consent refused (tenant, lender, planning, third party)
- Property devaluation (improvement would reduce market value by ≥5%)

Exemptions last **5 years maximum** and must be re-registered. Surface in TenureIQ via a `compliance_items.kind='epc'` row with `status='exempt'` and a documented expiry — do not let exemption mark the property compliant forever.

## Anti-patterns

1. Treating EPC as "valid for 10 years from issue" without checking expiry every time you compute MEES status.
2. Allowing a tenancy to be created on a property where `meesStatus` returns `let_blocked` without an explicit exemption record.
3. Hardcoding `'E'` as the minimum — always read from config.
