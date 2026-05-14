# Compliance Certificate Cadence and Auto-Extraction

Read when implementing the compliance module, OCR pipeline, or reminder logic.

## Certificate inventory and cadence

| Kind | Frequency | Notes |
|---|---|---|
| `gas_safety` | Annual (12 months from issue) | Engineer must be Gas Safe registered. Cert shows next inspection due. |
| `eicr` | 5 years | Test must show Satisfactory; Unsatisfactory must be remedied. |
| `epc` | 10 years | Re-required on major works; required for new tenancy if expired. |
| `hmo_licence` | Up to 5 years | LA-set; usually 5 years for first-time, may vary on renewal. |
| `fire_alarm` | Engineer test 6-monthly; user test weekly | Two cadences — engineer cert + landlord-held weekly log. |
| `emergency_lighting` | Engineer test annually; flick test monthly | Same dual cadence. |
| `pat` | Recommended annual | Not statutory but standard for HMO licence conditions. |
| `legionella` | Review every 2 years or on material change | Risk assessment, not a test. |
| `insurance` | Annual (renewal date) | Required to evidence to lenders and LAs. |
| `asbestos` | One-off survey + management plan | Re-survey on material change. |
| `fire_risk_assessment` | Annual review, formal redo on material change | FRA author should be competent person. |

Map this in code as:

```ts
// lib/domain/compliance.ts
export type ComplianceKind =
  | 'gas_safety' | 'eicr' | 'epc' | 'hmo_licence'
  | 'fire_alarm' | 'emergency_lighting' | 'pat'
  | 'legionella' | 'insurance' | 'asbestos' | 'fire_risk_assessment'

export const RECOMMENDED_INTERVAL_MONTHS: Record<ComplianceKind, number> = {
  gas_safety: 12,
  eicr: 60,
  epc: 120,
  hmo_licence: 60,
  fire_alarm: 6,
  emergency_lighting: 12,
  pat: 12,
  legionella: 24,
  insurance: 12,
  asbestos: 120,  // 10 years as a default re-survey interval
  fire_risk_assessment: 12,
}
```

## Status computation

```ts
export type ComplianceStatus = 'valid' | 'expiring' | 'expired' | 'missing'

export function complianceStatus(expiry: string | null, today = new Date()): ComplianceStatus {
  if (!expiry) return 'missing'
  const e = new Date(expiry)
  if (e < today) return 'expired'
  const daysUntil = (e.getTime() - today.getTime()) / 86_400_000
  if (daysUntil <= 60) return 'expiring'
  return 'valid'
}
```

`expiring` window is **60 days** — matches the lender pre-renewal window and gives the landlord time to book the engineer.

## Required vs recommended per property kind

Not every cert is required for every property:

| Property kind | Gas | EICR | EPC | HMO Lic | FRA | FA | EL |
|---|---|---|---|---|---|---|---|
| HMO (mandatory licence) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| HMO (no licence required) | ✅ | ✅ | ✅ | — | ✅ | ✅* | ✅* |
| Single let (AST) | ✅ | ✅ | ✅ | — | recommended | — | — |
| Block (common parts) | — | per flat | per flat | — | ✅ | ✅ | ✅ |
| Commercial | per use | ✅ | ✅ | — | ✅ | per use | per use |
| Development | — | — | — | — | (during works) | — | — |

\* Strongly recommended even where not strictly mandated.

Encode as `requiredKinds(propertyKind, hmoLicenceKind) → ComplianceKind[]`.

## OCR auto-extraction (M7)

Each certificate type has reliable text patterns. Use these regex anchors after running OCR:

### EPC
- Rating: match `/Energy efficiency rating[\s\S]{0,200}\b([A-G])\s*\(?\d{1,3}\)?/`
- Valid until: match `/(?:Valid until|Certificate expires|This certificate.*?valid until)\s*:?\s*(\d{1,2}\s+\w+\s+\d{4})/i`

### Gas Safety
- Next inspection: `/Next inspection due\s*:?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i`
- Engineer Gas Safe ID: `/Gas Safe (?:Reg(?:ister)?(?:ed)?)?\.?\s*(?:No\.?|Number)?\s*:?\s*(\d{7})/i`
- Outcome: keep raw text and flag if any "fail" / "at risk" / "immediately dangerous" is detected.

### EICR
- Next inspection date: `/Next inspection (?:recommended|due)\s*:?\s*(\d{1,2}[/\-\s]+\w+[/\-\s]+\d{2,4})/i`
- Overall outcome: `/Satisfactory|Unsatisfactory/i` (first match wins).

### Insurance schedule
- Period of insurance: `/Period of insurance\s*:?\s*(?:from\s+)?(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s*(?:to|-)\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i`
- Policy number: `/Policy (?:number|no\.?)\s*:?\s*(\S+)/i`

### HMO Licence
- Expiry: `/(?:expires?|valid until)\s*:?\s*(\d{1,2}[/\-\s]+\w+[/\-\s]+\d{2,4})/i`
- Licensed occupancy: `/(?:permitted|maximum)\s+(?:occupancy|occupants?)\s*:?\s*(\d+)/i`

## Confidence threshold

Auto-create compliance items **only** if:

1. OCR text contains the kind's keyword (e.g. "Energy Performance Certificate" for EPC).
2. The expiry date parsed parses successfully and is in the future.
3. Confidence indicators (clear keywords, date format match) score above threshold.

Otherwise, surface a "Confirm extracted fields" UI step where the user verifies before save. Never silently create a compliance item with low-confidence OCR.

## Reminder cron

Run daily at 07:00 Europe/London. For each compliance item where `status != 'valid'`:

- Create a `reminders` row if one does not exist for today.
- 90, 60, 30, 7 days before expiry: send email to org owner and admins.
- Day of expiry: send email.
- Daily thereafter until resolved.

Suppress weekend sends for `expiring` (not yet overdue) but always send for `expired`.

## Anti-patterns

1. Computing a certificate's expiry from the issue date instead of reading it from the document (gas certs often say "next inspection 12 December" — that's the truth, not issue + 12 months).
2. Auto-saving OCR-extracted data without a confirm step at low confidence.
3. Sending reminders for `missing` items if the user has not yet onboarded — wait 14 days after org creation before chasing missing certs.
4. Treating an EICR with "Unsatisfactory" outcome as `valid` because the date is in the future. Unsatisfactory = not compliant regardless of date.
