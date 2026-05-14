# HMO Licensing & LACORS

Read when implementing HMO licence logic, room sizing checks, or Article 4 surfacing.

## Three licensing regimes

### Mandatory HMO licence (national)
- **Trigger**: 5+ unrelated persons forming 2+ households living in shared accommodation.
- Applies regardless of property size or storeys (the 3-storey rule was removed in 2018).
- 5-year maximum duration. Annual fee varies by LA (typically £500–£1,500).
- Application requires: floor plans, gas safety certificate, EICR, fire risk assessment, EPC, manager fitness declaration.

### Additional licensing (LA-designated)
- Scope set by the local authority (e.g. "all HMOs with 3+ occupants in wards X, Y, Z").
- Cannot be inferred from property data alone. Must be a stored attribute set by user or admin.
- Each designation lasts up to 5 years; LAs renew or let lapse.

### Selective licensing (LA-designated, single-family lets)
- Applies to **single-family lets**, not just HMOs. Used by LAs to address antisocial behaviour, low demand, or poor stock.
- Same: stored, not inferred.

## TenureIQ enforcement

```ts
// lib/domain/hmo.ts
export type HmoLicenceKind = 'none' | 'mandatory' | 'additional' | 'selective'

export function mandatoryLicenceRequired(occupants: number, households: number): boolean {
  return occupants >= 5 && households >= 2
}

export function hmoLicenceStatus(property: {
  hmoLicenceKind: HmoLicenceKind
  hmoLicenceExpiry: string | null
  unitCount: number
}): 'valid' | 'expiring' | 'expired' | 'missing_required' | 'not_required' {
  // returns 'missing_required' if mandatoryLicenceRequired but kind is 'none'
  // ...
}
```

## LACORS sizing — kitchen and bedrooms

LACORS (Local Authorities Coordinators of Regulatory Services) guidance is the de-facto standard most LAs apply. Variance exists; treat output as advisory.

### Minimum bedroom areas (Housing Act 2004 statutory minimums, post-2018)

| Occupancy | Floor area |
|---|---|
| 1 person aged 10+ | 6.51 m² |
| 2 persons aged 10+ | 10.22 m² |
| 1 person aged <10 | 4.64 m² |

Rooms under statutory minimums **cannot be used as sleeping accommodation** for the relevant occupancy. Mandatory licence conditions specify this.

### Kitchen and amenity (LACORS guidance)

| Occupants sharing | Minimum kitchen area |
|---|---|
| 1–4 | 5 m² (with adequate appliances) |
| 5 | 7 m² |
| 6–10 | 9–11 m² |

Plus minimum amenities by headcount: 1 WC + bath/shower per 4 occupants is the typical LA expectation. Some LAs apply stricter ratios — store actual amenity counts on the property and validate against the LA's published HMO standards when available.

### Surface as warnings, not blocks

LA variance means LACORS isn't statutory. Implementation:

- Compute `lacorsKitchenStatus(kitchenAreaM2, occupants)` → `'compliant' | 'undersized' | 'borderline'`.
- Show on property detail as an amber flag with the calculation visible.
- Do not block tenancy creation on LACORS alone — block only on statutory minimums.

## Article 4 Direction

Removes the permitted development right to convert **C3 (dwellinghouse) to C4 (small HMO, 3-6 occupants)**.

Where in force:
- C3 → C4 needs planning permission.
- C3 → sui generis HMO (7+ occupants) needs planning permission anyway.
- C4 → C3 reversion does not need planning permission anywhere.

Storage on property: `article_4_area boolean`. LAs publish lists/maps but there is no national API. Capture at property creation; surface a banner if true and the user attempts to convert from C3.

## Compliance certificate cadence for HMOs

| Certificate | Frequency |
|---|---|
| Gas Safety | Annual (12 months) |
| EICR | 5 years |
| EPC | 10 years (re-test on major works) |
| Fire Risk Assessment | Annual review (formal redo on material change) |
| Fire Alarm test | Weekly user test + 6-monthly engineer test |
| Emergency Lighting | Monthly flick test + annual engineer test |
| PAT | Recommended annual for appliances supplied by landlord |
| Legionella risk assessment | Reviewed every 2 years, or on material change |
| HMO Licence | 5 years (LA-set) |

Encode in `lib/domain/compliance.ts` as a table of `kind → recommendedIntervalMonths`. Auto-create reminders on certificate upload.

## Anti-patterns

1. Inferring HMO licence type from postcode or LA name. Always store, never infer.
2. Allowing a tenancy to start on a property requiring a mandatory licence where `hmo_licence_kind = 'none'`.
3. Blocking tenancies on LACORS kitchen size alone (it is guidance, not law for many councils).
4. Treating an EICR as 1 year (gas safety is annual, EICR is 5-yearly — common confusion).
