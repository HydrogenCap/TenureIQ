# Column Mapping UI

When auto-detection fails (unrecognised bank format, hand-edited spreadsheet), let the user map their columns to canonical fields.

## When to show

- Bank import: no matching `BankFormat` and the file has 2+ data rows.
- Property import: required column missing from auto-mapping.
- Any import where the destination shape has > 5 fields.

For 1–4 field shapes, just instruct in the upload UI and reject malformed files.

## The mapping component

```tsx
// components/csv-column-mapping.tsx
'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

export type TargetField = {
  key: string           // e.g. 'addressLine1'
  label: string         // e.g. 'Address line 1'
  required: boolean
  hint?: string         // e.g. 'UK postcode format'
  aliases?: string[]    // headers that auto-match: ['address', 'street', 'line 1']
}

export function ColumnMapping({
  sourceHeaders,
  targetFields,
  sampleRow,
  onConfirm,
}: {
  sourceHeaders: string[]
  targetFields: TargetField[]
  sampleRow: Record<string, string>
  onConfirm: (mapping: Record<string, string>) => void
}) {
  // Initial mapping: alias-match each target field against headers
  const initial: Record<string, string> = {}
  for (const t of targetFields) {
    const lower = (s: string) => s.toLowerCase().trim()
    const match = sourceHeaders.find((h) =>
      lower(h) === lower(t.label) ||
      lower(h) === lower(t.key) ||
      (t.aliases ?? []).some((a) => lower(h) === lower(a))
    )
    if (match) initial[t.key] = match
  }

  // (use useState in actual implementation — pseudocode for brevity)
  const mapping = initial

  const unmappedRequired = targetFields.filter((t) => t.required && !mapping[t.key])
  const canConfirm = unmappedRequired.length === 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We didn't recognise this file format. Match each TenureIQ field to a column from your file:
      </p>

      <div className="rounded-md border divide-y">
        {targetFields.map((t) => (
          <div key={t.key} className="grid grid-cols-3 items-center gap-4 p-3">
            <div>
              <p className="text-sm font-medium">
                {t.label}
                {t.required && <span className="text-destructive ml-0.5">*</span>}
              </p>
              {t.hint && <p className="text-xs text-muted-foreground">{t.hint}</p>}
            </div>

            <Select
              value={mapping[t.key] ?? 'unmapped'}
              onValueChange={(v) => {
                // setMapping((m) => ({ ...m, [t.key]: v === 'unmapped' ? null : v }))
              }}
            >
              <SelectTrigger><SelectValue placeholder="Choose column..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unmapped">— Not in file —</SelectItem>
                {sourceHeaders.map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="text-xs text-muted-foreground font-mono truncate">
              {mapping[t.key] ? `e.g. "${sampleRow[mapping[t.key]] ?? ''}"` : '—'}
            </div>
          </div>
        ))}
      </div>

      {unmappedRequired.length > 0 && (
        <p className="text-sm text-destructive">
          Required field{unmappedRequired.length > 1 ? 's' : ''} not mapped:{' '}
          {unmappedRequired.map((t) => t.label).join(', ')}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => onConfirm(mapping)} disabled={!canConfirm}>
          Confirm mapping
        </Button>
      </div>
    </div>
  )
}
```

## Using the mapping output

The mapping is just `{ targetFieldKey: sourceColumnName }`. Apply when transforming rows:

```ts
function applyMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>
): Record<string, string>[] {
  return rows.map((raw) => {
    const out: Record<string, string> = {}
    for (const [targetKey, sourceCol] of Object.entries(mapping)) {
      out[targetKey] = raw[sourceCol] ?? ''
    }
    return out
  })
}
```

The remapped rows then go through the normal Zod validation in `lib/csv/validate.ts`.

## Persisting mappings

If a user maps the same headers again next month, don't make them re-do it. Save mappings by header signature:

```prisma
model CsvImportMapping {
  id              String   @id @default(uuid()) @db.Uuid
  organisationId  String   @map("organisation_id") @db.Uuid
  resourceKind    String   @map("resource_kind")  // 'properties' | 'transactions' | 'tenancies'
  headerSignature String   @map("header_signature")  // sha256 of sorted, lowercased headers
  mappingJson     Json     @map("mapping_json")  // { targetField: sourceColumn }

  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  organisation    Organisation @relation(fields: [organisationId], references: [id])

  @@unique([organisationId, resourceKind, headerSignature])
  @@map("csv_import_mappings")
}
```

On upload, compute the signature; if a stored mapping exists, skip the mapping UI and go straight to preview.

## Anti-patterns

1. **Surface the mapping UI on every import.** First-time users see it; returning users with the same format shouldn't.
2. **Require mapping for every column.** Optional target fields stay unmapped silently.
3. **Sample-row preview shows the raw data dump.** Just show the value for the currently-mapped column — that's all the user needs to confirm.
4. **Storing the user's literal column names as the canonical names.** Always map back to the canonical schema field before validating.
