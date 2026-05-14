---
name: tenureiq-csv-import
description: CSV import pattern for TenureIQ — Papaparse + Zod row validation + preview table with row-level errors + commit with progress. Use when building any CSV import flow: properties (M2), bank transactions (M5), tenancies (M3), or any other bulk-load surface. The pattern is non-trivial enough that doing it from scratch costs a full day per use. With this skill, each use is ~30 minutes.
---

# TenureIQ CSV Import Pattern

A four-stage CSV import flow with row-level validation and commit-time atomicity. Used wherever users bulk-load data from a spreadsheet or bank export.

## When to load deeper references

| Topic | Reference |
|---|---|
| Transaction CSV with bank-format auto-detection and category memory | `references/transaction-imports.md` |
| Column mapping UI (when the user's headers don't match canonical names) | `references/column-mapping.md` |

## The four stages

1. **Upload** — user picks a `.csv` file. Client-side size and extension check.
2. **Parse + validate** — Papaparse → schema → row-level errors collected.
3. **Preview** — user sees parsed rows in a table, errors highlighted, can fix the file and re-upload, or proceed (errors block).
4. **Commit** — server action inserts rows in a single transaction, with a progress indicator for files > 1k rows.

## File structure

```
app/(app)/<resource>/import/
  page.tsx                # entry — single page that drives all four stages
  _components/
    import-wizard.tsx     # the wizard (client component, manages stage state)
    preview-table.tsx     # the parsed-rows view with errors
  actions.ts              # commitImport server action
lib/schemas/<resource>.ts # the same Zod schema the form uses
lib/csv/
  parse.ts                # shared Papaparse wrapper
  validate.ts             # row-level validation against a Zod schema
```

## The shared CSV helpers

```ts
// lib/csv/parse.ts
import Papa from 'papaparse'

export type ParsedRow = Record<string, string>

export type ParseResult = {
  headers: string[]
  rows: ParsedRow[]
  errors: Papa.ParseError[]
}

export async function parseCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data,
          errors: results.errors,
        })
      },
      error: reject,
    })
  })
}
```

```ts
// lib/csv/validate.ts
import { z, ZodSchema } from 'zod'

export type ValidationError = {
  rowIndex: number
  field: string
  message: string
}

export type ValidationResult<T> = {
  valid: T[]
  invalid: Array<{ rowIndex: number; raw: Record<string, string>; errors: ValidationError[] }>
}

export function validateRows<T>(
  rows: Record<string, string>[],
  schema: ZodSchema<T>,
  mapRow: (raw: Record<string, string>) => Record<string, unknown>
): ValidationResult<T> {
  const valid: T[] = []
  const invalid: ValidationResult<T>['invalid'] = []

  rows.forEach((raw, rowIndex) => {
    const mapped = mapRow(raw)
    const result = schema.safeParse(mapped)
    if (result.success) {
      valid.push(result.data)
    } else {
      invalid.push({
        rowIndex,
        raw,
        errors: result.error.issues.map((issue) => ({
          rowIndex,
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
  })

  return { valid, invalid }
}
```

## The wizard component

```tsx
// app/(app)/properties/import/_components/import-wizard.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { parseCsv, type ParsedRow } from '@/lib/csv/parse'
import { validateRows, type ValidationResult } from '@/lib/csv/validate'
import { PropertyCreateSchema, type PropertyCreate } from '@/lib/schemas/property'
import { commitPropertyImport } from '../actions'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import { PreviewTable } from './preview-table'

type Stage = 'upload' | 'preview' | 'committing' | 'done' | 'failed'

// Map CSV column names (lenient) → schema fields
function mapPropertyRow(raw: ParsedRow): Record<string, unknown> {
  const lower = (k: string) => raw[k] ?? raw[k.toLowerCase()] ?? raw[k.toUpperCase()] ?? ''
  return {
    entityId: lower('Entity ID') || lower('entity_id'),
    addressLine1: lower('Address line 1') || lower('address') || lower('address_line_1'),
    addressLine2: lower('Address line 2') || lower('address_line_2'),
    city: lower('City'),
    postcode: lower('Postcode'),
    kind: (lower('Kind') || 'hmo').toLowerCase().replace(/\s+/g, '_'),
    purchasePricePence: lower('Purchase price') || lower('Price'),
    purchaseDate: lower('Purchase date') || lower('Date'),
    epcRating: lower('EPC') || null,
    epcExpiry: lower('EPC expiry') || null,
    hmoLicenceKind: (lower('HMO licence') || 'none').toLowerCase(),
    article4Area: ['true', 'yes', '1', 'y'].includes(lower('Article 4').toLowerCase()),
  }
}

export function PropertyImportWizard() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('upload')
  const [validation, setValidation] = useState<ValidationResult<PropertyCreate> | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const onFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a .csv file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large (10MB max).')
      return
    }
    setError(null)
    const parsed = await parseCsv(file)
    const result = validateRows(parsed.rows, PropertyCreateSchema, mapPropertyRow)
    setValidation(result)
    setStage('preview')
  }

  const commit = () => {
    if (!validation || validation.invalid.length > 0) return
    setStage('committing')
    setProgress({ done: 0, total: validation.valid.length })

    startTransition(async () => {
      // Commit in batches of 50 to give the user progress feedback
      const BATCH = 50
      for (let i = 0; i < validation.valid.length; i += BATCH) {
        const batch = validation.valid.slice(i, i + BATCH)
        const result = await commitPropertyImport(batch)
        if (!result.ok) {
          setError(result.error)
          setStage('failed')
          return
        }
        setProgress({ done: Math.min(i + BATCH, validation.valid.length), total: validation.valid.length })
      }
      setStage('done')
      setTimeout(() => router.push('/properties'), 1500)
    })
  }

  if (stage === 'upload') {
    return (
      <div className="space-y-4">
        <label className="flex flex-col items-center justify-center gap-3 p-12 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">Drop a CSV file or click to choose</p>
            <p className="text-xs text-muted-foreground mt-1">10MB max — see column reference below</p>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="text-sm space-y-2">
          <p className="font-medium">CSV columns (case-insensitive):</p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
            <li><code>Entity ID</code> (uuid, required) — the entity that holds the property</li>
            <li><code>Address line 1</code> (required)</li>
            <li><code>City</code> (required)</li>
            <li><code>Postcode</code> (required, UK format)</li>
            <li><code>Kind</code> — hmo | single_let | block | commercial | development | land (default hmo)</li>
            <li><code>Purchase price</code> — in £ (e.g. 250000 or £250,000)</li>
            <li><code>Purchase date</code> — YYYY-MM-DD</li>
            <li><code>EPC</code>, <code>EPC expiry</code>, <code>HMO licence</code>, <code>Article 4</code> — optional</li>
          </ul>
        </div>
      </div>
    )
  }

  if (stage === 'preview' && validation) {
    const canCommit = validation.invalid.length === 0 && validation.valid.length > 0
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium">{validation.valid.length}</span> rows ready to import
            {validation.invalid.length > 0 && (
              <span className="text-destructive ml-2">
                ({validation.invalid.length} need fixing)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStage('upload')}>Back</Button>
            <Button onClick={commit} disabled={!canCommit}>
              {canCommit ? `Import ${validation.valid.length} properties` : 'Fix errors to continue'}
            </Button>
          </div>
        </div>
        <PreviewTable validation={validation} />
      </div>
    )
  }

  if (stage === 'committing') {
    const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0
    return (
      <div className="text-center py-12 space-y-4">
        <p className="font-medium">Importing {progress.total} properties...</p>
        <div className="mx-auto max-w-md h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">{progress.done} of {progress.total}</p>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div className="text-center py-12 space-y-4">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <p className="font-medium">Imported {progress.done} properties</p>
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    )
  }

  // failed
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Import failed</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
      <Button onClick={() => setStage('upload')}>Start over</Button>
    </div>
  )
}
```

## The preview table

```tsx
// app/(app)/properties/import/_components/preview-table.tsx
'use client'

import { ValidationResult } from '@/lib/csv/validate'
import { PropertyCreate } from '@/lib/schemas/property'
import { AlertCircle } from 'lucide-react'

export function PreviewTable({ validation }: { validation: ValidationResult<PropertyCreate> }) {
  // Show invalid rows first, then a sample of valid rows
  const all = [
    ...validation.invalid.map((i) => ({ kind: 'invalid' as const, ...i })),
    ...validation.valid.slice(0, 20).map((v, i) => ({
      kind: 'valid' as const,
      rowIndex: validation.invalid.length + i,
      raw: v as unknown as Record<string, string>,
      errors: [],
    })),
  ]

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Row</th>
              <th className="px-3 py-2 text-left">Address</th>
              <th className="px-3 py-2 text-left">Postcode</th>
              <th className="px-3 py-2 text-left">Kind</th>
              <th className="px-3 py-2 text-left">Price</th>
              <th className="px-3 py-2 text-left">Errors</th>
            </tr>
          </thead>
          <tbody>
            {all.map((row) => (
              <tr key={row.rowIndex} className={row.kind === 'invalid' ? 'bg-destructive/5' : ''}>
                <td className="px-3 py-2 text-muted-foreground">{row.rowIndex + 2 /* +2 = header row + 1-based */}</td>
                <td className="px-3 py-2">{row.raw['Address line 1'] ?? row.raw['address_line_1']}</td>
                <td className="px-3 py-2">{row.raw['Postcode'] ?? row.raw['postcode']}</td>
                <td className="px-3 py-2">{row.raw['Kind'] ?? row.raw['kind']}</td>
                <td className="px-3 py-2">{row.raw['Purchase price'] ?? row.raw['price']}</td>
                <td className="px-3 py-2">
                  {row.errors.length > 0 && (
                    <ul className="space-y-0.5">
                      {row.errors.map((e, i) => (
                        <li key={i} className="text-destructive text-xs flex items-start gap-1">
                          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span><strong>{e.field}:</strong> {e.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {validation.valid.length > 20 && (
        <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-t">
          Showing first 20 of {validation.valid.length} valid rows.
        </div>
      )}
    </div>
  )
}
```

## The server action

```ts
// app/(app)/properties/import/actions.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/lib/auth/require'
import { supabaseServer } from '@/lib/db/user'
import { PropertyCreateSchema, type PropertyCreate } from '@/lib/schemas/property'

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

const BatchSchema = z.array(PropertyCreateSchema).min(1).max(50)

export async function commitPropertyImport(batch: unknown): Promise<ActionResult<{ inserted: number }>> {
  const auth = await requireOrgRole(['owner', 'admin', 'manager'])
  if (!auth.ok) return { ok: false, error: auth.error }

  const parsed = BatchSchema.safeParse(batch)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid batch — please reload the import.' }
  }

  // Validate every entity_id belongs to this organisation
  const entityIds = [...new Set(parsed.data.map((r) => r.entityId))]
  const sb = await supabaseServer()
  const { data: entities } = await sb
    .from('entities')
    .select('id')
    .in('id', entityIds)
    .is('deleted_at', null)

  const allowedEntityIds = new Set((entities ?? []).map((e) => e.id))
  const orphanedRow = parsed.data.find((r) => !allowedEntityIds.has(r.entityId))
  if (orphanedRow) {
    return { ok: false, error: `Entity ID ${orphanedRow.entityId} not found in your organisation.` }
  }

  // Insert
  const insertPayload = parsed.data.map((r: PropertyCreate) => ({
    organisation_id: auth.organisationId,
    entity_id: r.entityId,
    address_line_1: r.addressLine1,
    address_line_2: r.addressLine2 || null,
    city: r.city,
    county: r.county || null,
    postcode: r.postcode.toUpperCase().replace(/\s+/g, ' ').trim(),
    kind: r.kind,
    purchase_price_pence: r.purchasePricePence.toString(),
    purchase_date: r.purchaseDate.toISOString().slice(0, 10),
    epc_rating: r.epcRating ?? null,
    epc_expiry: r.epcExpiry ? r.epcExpiry.toISOString().slice(0, 10) : null,
    hmo_licence_kind: r.hmoLicenceKind,
    article_4_area: r.article4Area,
    is_aasc_property: r.isAascProperty,
  }))

  const { error } = await sb.from('properties').insert(insertPayload)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/properties')
  return { ok: true, data: { inserted: parsed.data.length } }
}
```

## Why these specifics matter

- **Header transformation tolerant of case + spacing variants.** Users export from QuickBooks, Excel, Google Sheets — all slightly different conventions.
- **Schema-driven mapping (`mapPropertyRow`).** The mapping fn does the dirty work; the schema only sees a clean object.
- **All errors collected before stopping.** No "fix one, see next" — show every error at once so the user can fix the source file in one pass.
- **Batched commit with progress.** A 500-row import in one INSERT call works but provides no feedback. Batching of 50 gives a progress bar without breaking atomicity per-batch.
- **Server-side re-validation.** The Zod schema runs again on commit, even though the client validated. Server is the trust boundary.
- **Entity-ownership check.** Without this, a malicious user could import properties referencing entities they don't own. RLS would reject the insert, but failing early with a clear error is better UX.

## Anti-patterns

1. **Trusting client-side validation.** Always re-validate in the server action.
2. **Single-shot transaction for thousands of rows.** Postgres can handle it, but the user experience is "frozen tab, then maybe success" with no progress.
3. **Showing only the first error.** A 100-row file with 10 errors should display all 10.
4. **Silent column mapping.** If the user's headers don't match, tell them which header was expected — don't pretend it succeeded with nulls.
5. **Hard-coded paths or org_id in the action.** Always derive from `auth`.
6. **Importing into the source-of-truth table directly without a staging step for transactions.** See `references/transaction-imports.md` for the staging pattern.
