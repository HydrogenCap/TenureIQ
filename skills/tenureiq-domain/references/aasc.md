# AASC — Asylum Accommodation Support Contract

The AASC is the UK Home Office's framework for housing asylum seekers in dispersal accommodation. It is administered by three regional prime contractors who in turn sub-contract or directly lease properties from landlords. TenureIQ's AASC module is the primary differentiator vs Coho.

## Contractors and their regions

| Contractor | Region |
|---|---|
| **Clearsprings Ready Homes** | South England and Wales |
| **Serco** | North West, Midlands, East of England |
| Mears | Scotland, North East, Northern Ireland (out of scope for TenureIQ v1) |

## How landlords engage

Two structures exist:

1. **Direct lease** — the contractor takes a full lease (typically 3 or 5 years) and pays a fixed rent regardless of occupancy. Landlord receives a single payment monthly. Lower headline rate but zero void risk.
2. **Sub-lease / supply agreement** — the landlord supplies furnished accommodation and is paid per occupied bed. Higher headline rate, void risk shifted to the landlord.

TenureIQ supports both via `aasc_contracts.kind` (not yet implemented — add when needed).

## The rate that matters: Clearsprings shared accommodation

Clearsprings pays providers up to **LHA Shared Accommodation Rate + 40%** for dispersal HMO/shared properties.

**This is the single most-misquoted fact in casual AASC writeups.** Many investor blogs claim Clearsprings caps at SAR or below. They are wrong. The +40% uplift is what makes this profitable for landlords above LHA-only rents.

Encode this as:

```ts
// lib/domain/aasc.ts
export const CLEARSPRINGS_UPLIFT_BPS = 4000  // +40% on SAR

export function clearspringsMaxRate(sarPence: bigint): bigint {
  return (sarPence * BigInt(10000 + CLEARSPRINGS_UPLIFT_BPS)) / 10000n
}
```

Serco rates vary by area and are negotiated per contract. Do not encode a single uplift constant.

## Serco area procurement status

Serco publishes property procurement status by local authority. As of 12/03/26:

- **OPEN** — actively procuring properties
- **LIMITED** — only specific property types or limited volumes
- **CLOSED** — not procuring; existing contracts may continue

Use `data/serco-areas.json` for the seed. Update via admin tooling when Serco publishes a new list. Surface area status on property creation: if a user enters a property in a CLOSED Serco area, show a warning before save.

## Clearsprings demand gaps

Clearsprings does not publish open/closed status the same way. Instead, work from a periodically-updated demand-gap dataset (`data/clearsprings-demand-gaps.json`) showing how many beds are needed in each LA above current supply.

Negative gap = oversupplied (Portsmouth -206 is a real example). Treat as "do not pursue" rather than impossible — agreements get cancelled and gaps reopen.

## Critical demand gaps (sample — South and SE)

These are illustrative for the seed dataset. Real numbers should be refreshed quarterly:

| Local Authority | Demand-pending beds | Notes |
|---|---:|---|
| Brighton | 547 | Largest South-coast gap |
| Wiltshire | 801 | |
| Oxford | 318 | |
| Wealden | 296 | Zero existing pipeline as of last update |
| Maidstone | 224 | |
| Cheltenham | 223 | (where the Clarence Court block sits) |
| Slough | 222 | |
| Thanet | 201 | |
| Medway | 201 | |
| Eastbourne | 166 | |
| Vale of White Horse | 102 | Wantage etc — Oxfordshire commuter belt |

## Placement workflow

1. Landlord identifies a property in an open area with demand gap.
2. Property is offered to the contractor with floor plan, EPC, compliance pack, photos.
3. Contractor inspects, agrees rate per bed (Clearsprings) or per property (Serco lease).
4. Placements begin — service users (asylum seekers) move in.
5. Landlord invoices/receives payments. Vacancies between service users are typically borne by the contractor on a Clearsprings shared-supply agreement, by the landlord on a sub-lease.

TenureIQ models placements as `tenancies` with `kind='aasc_placement'`, linked to an `aasc_placements` row capturing the placement reference, payer, weekly rate, and service-user count.

## AASC tenancy modelling rules

- Tenant identity is **not stored** for AASC placements. Asylum seekers are confidential service users; storing names is unnecessary and a data-protection risk.
- Use `tenancies.aasc_placement_ref` as the reference. The `tenant_id` column should be `null` for placements.
- Service-user counts are stored on `aasc_placements.service_user_count` so a 5-bed HMO can show "4 SUs placed, 1 bed vacant" without storing individuals.

## Reporting needs

The AASC Placement Report (M10) must include:

- Active placements by contractor
- Weekly placement income, monthly and annualised
- Average occupancy by property and aggregate
- Vacancies > 7 days (revenue at risk)
- Demand-gap context for the property's LA
- Serco area status as of the report date

## Contract break clause (sector intelligence)

The current AASC contract is breakable from **March 2026**. Treat this as configurable, not hardcoded — but surface a calm advisory in the AASC dashboard tile: "AASC contract is in a re-tender window; concentration risk warrants reviewing diversification."

## Anti-patterns (refuse)

1. Storing AASC service user names in the database.
2. Assuming Clearsprings pays at or below LHA SAR.
3. Hardcoding area statuses or demand gaps in TS source files.
4. Letting placements be created in Serco CLOSED areas without an explicit override and audit-log entry.
