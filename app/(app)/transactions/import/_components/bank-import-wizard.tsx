'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'

import { parseCsv } from '@/lib/csv/parse'
import { detectBankFormat } from '@/lib/csv/bank-formats'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { createImport, type CreateImportResult } from '../actions'

type Stage =
  | 'pick-account'
  | 'upload'
  | 'column-mapping'
  | 'committing'
  | 'done'
  | 'failed'

type BankOpt = { id: string; name: string }

type ParsedCsv = {
  filename: string
  headers: string[]
  rows: Array<Record<string, string>>
}

type ColumnMapping = {
  posted_at: string
  description: string
  amount_pence: string
  reference: string
  external_id: string
}

const CANONICAL_HEADERS = ['posted_at', 'description', 'amount_pence']

// Picks a reasonable default for each canonical slot by matching common
// header variants. Falls back to '' (= "pick yourself").
function guessMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().trim())
  const find = (...needles: string[]): string => {
    for (let i = 0; i < lower.length; i++) {
      const h = lower[i] ?? ''
      if (needles.some((n) => h === n || h.includes(n))) {
        return headers[i] ?? ''
      }
    }
    return ''
  }
  return {
    posted_at: find('date', 'posted'),
    description: find('description', 'name', 'merchant', 'payee', 'narrative'),
    amount_pence: find('amount', 'value', 'debit', 'credit'),
    reference: find('reference', 'memo', 'notes'),
    external_id: find('transaction id', 'id', 'ref'),
  }
}

function applyMapping(
  rows: Array<Record<string, string>>,
  mapping: ColumnMapping,
): Array<Record<string, string>> {
  return rows.map((row) => {
    const out: Record<string, string> = {}
    if (mapping.posted_at) out.posted_at = row[mapping.posted_at] ?? ''
    if (mapping.description) out.description = row[mapping.description] ?? ''
    if (mapping.amount_pence) out.amount_pence = row[mapping.amount_pence] ?? ''
    if (mapping.reference) out.reference = row[mapping.reference] ?? ''
    if (mapping.external_id) out.external_id = row[mapping.external_id] ?? ''
    return out
  })
}

export function BankImportWizard({ bankAccounts }: { bankAccounts: BankOpt[] }) {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>(
    bankAccounts.length === 0 ? 'failed' : 'pick-account',
  )
  const [bankAccountId, setBankAccountId] = useState<string>(bankAccounts[0]?.id ?? '')
  const [error, setError] = useState<string | null>(
    bankAccounts.length === 0 ? 'No bank accounts yet — add one before importing.' : null,
  )
  const [result, setResult] = useState<CreateImportResult | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({
    posted_at: '',
    description: '',
    amount_pence: '',
    reference: '',
    external_id: '',
  })
  const [, startTransition] = useTransition()

  const submitImport = (
    filename: string,
    headers: string[],
    rows: Array<Record<string, string>>,
  ) => {
    setStage('committing')
    startTransition(async () => {
      const r = await createImport({
        bankAccountId,
        filename,
        headers,
        rows,
      })
      if (!r.ok) {
        setError(r.error)
        setStage('failed')
        return
      }
      setResult(r.data)
      setStage('done')
    })
  }

  const onFile = async (file: File) => {
    if (!bankAccountId) {
      setError('Pick a bank account first.')
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large (10MB max).')
      return
    }
    setError(null)
    try {
      const csv = await parseCsv(file)
      const fmt = detectBankFormat(csv.headers)
      // Recognised bank format OR canonical columns already present →
      // skip the mapping step and stage straight through.
      const hasCanonical = CANONICAL_HEADERS.every((c) =>
        csv.headers.map((h) => h.toLowerCase().trim()).includes(c),
      )
      if (fmt.id !== 'generic' || hasCanonical) {
        submitImport(file.name, csv.headers, csv.rows)
        return
      }
      // Generic + no canonical columns → ask the user to map.
      setParsed({ filename: file.name, headers: csv.headers, rows: csv.rows })
      setMapping(guessMapping(csv.headers))
      setStage('column-mapping')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'parse failed')
      setStage('failed')
    }
  }

  const onApplyMapping = () => {
    if (!parsed) return
    if (!mapping.posted_at || !mapping.description || !mapping.amount_pence) {
      setError('Date, description, and amount columns are all required.')
      return
    }
    setError(null)
    const remapped = applyMapping(parsed.rows, mapping)
    submitImport(parsed.filename, Object.keys(remapped[0] ?? {}), remapped)
  }

  if (stage === 'pick-account') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium">Which bank account does this CSV belong to?</p>
          <Select
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            className="mt-2 max-w-md"
          >
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
        <Button onClick={() => setStage('upload')} disabled={!bankAccountId}>
          Continue →
        </Button>
      </div>
    )
  }

  if (stage === 'upload') {
    return (
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 hover:bg-muted/50">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">Drop a CSV or click to choose</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Monzo / Starling / HSBC formats auto-detected · 10MB max
            </p>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
            }}
          />
        </label>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2 text-sm">
          <p className="font-medium">Supported formats</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>
              <strong>Monzo</strong> — direct CSV export from the app or web dashboard.
            </li>
            <li>
              <strong>Starling</strong> — Starling Business or personal CSV export.
            </li>
            <li>
              <strong>HSBC</strong> — Business Internet Banking CSV (Paid in / Paid out columns).
            </li>
            <li>
              <strong>Generic</strong> — any CSV with canonical columns
              (<code>posted_at</code>, <code>description</code>, <code>amount_pence</code>).
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Auto-categorisation runs against your saved rules; duplicates against this account&apos;s
            existing transactions on the same date and exact pence amount are flagged for review.
          </p>
        </div>
      </div>
    )
  }

  if (stage === 'column-mapping' && parsed) {
    const headerOptions = parsed.headers
    const previewRow = parsed.rows[0]
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">{parsed.filename}</p>
          <p className="text-xs text-muted-foreground">
            We couldn&apos;t auto-detect the format. Map each of your columns to one of
            our canonical fields, then continue.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MappingField
            label="Date column *"
            mappedHeader={mapping.posted_at}
            sampleValue={previewRow ? previewRow[mapping.posted_at] ?? '' : ''}
            headers={headerOptions}
            onChange={(v) => setMapping({ ...mapping, posted_at: v })}
            required
          />
          <MappingField
            label="Description column *"
            mappedHeader={mapping.description}
            sampleValue={previewRow ? previewRow[mapping.description] ?? '' : ''}
            headers={headerOptions}
            onChange={(v) => setMapping({ ...mapping, description: v })}
            required
          />
          <MappingField
            label="Amount column * (positive = credit, negative = debit)"
            mappedHeader={mapping.amount_pence}
            sampleValue={previewRow ? previewRow[mapping.amount_pence] ?? '' : ''}
            headers={headerOptions}
            onChange={(v) => setMapping({ ...mapping, amount_pence: v })}
            required
          />
          <MappingField
            label="Reference column (optional)"
            mappedHeader={mapping.reference}
            sampleValue={previewRow ? previewRow[mapping.reference] ?? '' : ''}
            headers={headerOptions}
            onChange={(v) => setMapping({ ...mapping, reference: v })}
          />
          <MappingField
            label="External ID column (optional, for dedup)"
            mappedHeader={mapping.external_id}
            sampleValue={previewRow ? previewRow[mapping.external_id] ?? '' : ''}
            headers={headerOptions}
            onChange={(v) => setMapping({ ...mapping, external_id: v })}
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2">
          <Button onClick={onApplyMapping}>Apply mapping &amp; continue →</Button>
          <Button variant="outline" onClick={() => {
            setParsed(null)
            setStage('upload')
          }}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  if (stage === 'committing') {
    return (
      <div className="space-y-3 py-12 text-center">
        <p className="font-medium">Parsing &amp; staging…</p>
        <div className="mx-auto h-2 max-w-md overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/2 animate-pulse bg-primary" />
        </div>
        <p className="text-sm text-muted-foreground">This stays in &apos;previewing&apos; until you commit.</p>
      </div>
    )
  }

  if (stage === 'done' && result) {
    return (
      <div className="space-y-4">
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>
            {result.rowCount} rows staged · {result.format} format
          </AlertTitle>
          <AlertDescription>
            {result.duplicateCount > 0 && (
              <>
                {result.duplicateCount} flagged as duplicates (already on this account).{' '}
              </>
            )}
            {result.uncategorisedCount > 0 && (
              <>{result.uncategorisedCount} need a category before commit.</>
            )}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button onClick={() => router.push(`/transactions/import/${result.importId}`)}>
            Review &amp; commit →
          </Button>
          <Button variant="outline" onClick={() => setStage('upload')}>
            Upload another
          </Button>
        </div>
      </div>
    )
  }

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

function MappingField({
  label,
  mappedHeader,
  sampleValue,
  headers,
  onChange,
  required = false,
}: {
  label: string
  mappedHeader: string
  sampleValue: string
  headers: string[]
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <Select
        value={mappedHeader}
        onChange={(e) => onChange(e.currentTarget.value)}
      >
        <option value="">{required ? '— pick a column —' : '— none —'}</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
      {sampleValue && (
        <p className="truncate text-xs text-muted-foreground">
          Sample: <span className="font-mono">{sampleValue}</span>
        </p>
      )}
    </div>
  )
}
