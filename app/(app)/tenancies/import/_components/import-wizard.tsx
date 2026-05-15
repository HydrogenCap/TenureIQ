// app/(app)/tenancies/import/_components/import-wizard.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'

import { parseCsv, type ParsedRow } from '@/lib/csv/parse'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { commitTenancyImport, type CommitTenancyImportResult } from '../actions'

type Stage = 'upload' | 'preview' | 'committing' | 'done' | 'failed'

type MappedRow = {
  propertyPostcode: string | null
  propertyId: string | null
  unitLabel: string | null
  kind: string
  startDate: string
  endDateIntended: string | null
  rentPence: string
  rentPeriod: string
  tenantFirstName: string | null
  tenantLastName: string | null
  tenantEmail: string | null
  notes: string | null
}

function mapRow(raw: ParsedRow): MappedRow {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const direct = raw[k]
      if (direct !== undefined && direct !== '') return direct
      const lower = raw[k.toLowerCase()]
      if (lower !== undefined && lower !== '') return lower
    }
    return ''
  }
  return {
    propertyPostcode: pick('Property', 'Postcode', 'postcode', 'property_postcode') || null,
    propertyId: pick('Property ID', 'property_id') || null,
    unitLabel: pick('Unit', 'unit', 'unit_label') || null,
    kind: (pick('Kind', 'kind') || 'ast').toLowerCase().replace(/\s+/g, '_'),
    startDate: pick('Start date', 'start_date', 'startDate'),
    endDateIntended: pick('End date', 'end_date', 'end_date_intended') || null,
    rentPence: pick('Rent', 'rent', 'rent_pence'),
    rentPeriod: (pick('Period', 'period', 'rent_period') || 'monthly').toLowerCase(),
    tenantFirstName: pick('Tenant first name', 'first_name', 'tenant_first_name') || null,
    tenantLastName: pick('Tenant last name', 'last_name', 'tenant_last_name') || null,
    tenantEmail: pick('Tenant email', 'email', 'tenant_email') || null,
    notes: pick('Notes', 'notes') || null,
  }
}

export function TenancyImportWizard() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('upload')
  const [rows, setRows] = useState<MappedRow[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<CommitTenancyImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const onFile = async (file: File) => {
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
      const parsed = await parseCsv(file)
      const mapped = parsed.rows.map(mapRow).filter((r) => r.startDate || r.propertyPostcode)
      setRows(mapped)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse file.')
    }
  }

  const commit = () => {
    setStage('committing')
    setProgress({ done: 0, total: rows.length })
    setResult({ inserted: 0, rowErrors: [] })

    startTransition(async () => {
      const BATCH = 50
      const aggregate: CommitTenancyImportResult = { inserted: 0, rowErrors: [] }
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const r = await commitTenancyImport(batch, i)
        if (!r.ok) {
          setError(r.error)
          setStage('failed')
          return
        }
        aggregate.inserted += r.data.inserted
        aggregate.rowErrors.push(...r.data.rowErrors)
        setProgress({
          done: Math.min(i + BATCH, rows.length),
          total: rows.length,
        })
        setResult({ ...aggregate })
      }
      setStage('done')
    })
  }

  if (stage === 'upload') {
    return (
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 hover:bg-muted/50">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">Drop a CSV file or click to choose</p>
            <p className="mt-1 text-xs text-muted-foreground">10MB max</p>
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
          <p className="font-medium">CSV columns (case-insensitive):</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            <li>
              <code>Property</code> (postcode) — used to look up the property. If multiple properties
              share a postcode, the row fails and asks for <code>Property ID</code>.
            </li>
            <li>
              <code>Property ID</code> (uuid) — preferred when postcode is ambiguous.
            </li>
            <li>
              <code>Unit</code> — optional. Looked up by label per-property.
            </li>
            <li>
              <code>Kind</code> — ast | licence | company_let | holiday_let. Default ast.
            </li>
            <li>
              <code>Start date</code> (YYYY-MM-DD, required), <code>End date</code> (optional
              intended end).
            </li>
            <li>
              <code>Rent</code> (in £), <code>Period</code> (weekly | four_weekly | monthly |
              annual; default monthly).
            </li>
            <li>
              <code>Tenant first name</code>, <code>Tenant last name</code>,{' '}
              <code>Tenant email</code> — required for ast/licence/company_let.
            </li>
            <li>
              <code>Notes</code> — optional free text.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            MEES-blocked properties (EPC F/G with no exemption) will be reported as failures, not
            applied.
          </p>
        </div>
      </div>
    )
  }

  if (stage === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm">
            <span className="font-medium">{rows.length}</span> rows parsed. Per-row validation runs
            at commit time — you'll get a list of failures with reasons.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStage('upload')}>
              Back
            </Button>
            <Button onClick={commit}>Import {rows.length} rows</Button>
          </div>
        </div>
        <PreviewSample rows={rows.slice(0, 10)} />
        {rows.length > 10 && (
          <p className="text-xs text-muted-foreground">Showing first 10 of {rows.length} rows.</p>
        )}
      </div>
    )
  }

  if (stage === 'committing') {
    const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="font-medium">Importing {progress.total} tenancies…</p>
        <div className="mx-auto h-2 max-w-md overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-muted-foreground">
          {progress.done} of {progress.total}
        </p>
      </div>
    )
  }

  if (stage === 'done' && result) {
    const hasFailures = result.rowErrors.length > 0
    return (
      <div className="space-y-4">
        <Alert variant={hasFailures ? 'default' : 'default'}>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>
            Imported {result.inserted} of {rows.length}{' '}
            {hasFailures ? `(${result.rowErrors.length} failed)` : ''}
          </AlertTitle>
          <AlertDescription>
            {hasFailures ? 'Review the failure reasons below and fix the source file.' : 'All rows imported.'}
          </AlertDescription>
        </Alert>
        {hasFailures && (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">Row</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.rowErrors.map((e, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-muted-foreground">{e.rowIndex + 2}</td>
                    <td className="px-3 py-2">{e.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setStage('upload')}>
            Import another file
          </Button>
          <Button onClick={() => router.push('/tenancies')}>Go to tenancies</Button>
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

function PreviewSample({ rows }: { rows: MappedRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">Property</th>
            <th className="px-3 py-2 text-left">Unit</th>
            <th className="px-3 py-2 text-left">Start</th>
            <th className="px-3 py-2 text-left">Rent</th>
            <th className="px-3 py-2 text-left">Period</th>
            <th className="px-3 py-2 text-left">Tenant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td className="px-3 py-2">{row.propertyPostcode ?? row.propertyId ?? '—'}</td>
              <td className="px-3 py-2">{row.unitLabel ?? '—'}</td>
              <td className="px-3 py-2">{row.startDate}</td>
              <td className="px-3 py-2">{row.rentPence}</td>
              <td className="px-3 py-2">{row.rentPeriod}</td>
              <td className="px-3 py-2">
                {row.tenantFirstName ?? ''} {row.tenantLastName ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
