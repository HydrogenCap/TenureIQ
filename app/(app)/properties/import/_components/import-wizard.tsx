// app/(app)/properties/import/_components/import-wizard.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'

import { parseCsv, type ParsedRow } from '@/lib/csv/parse'
import { validateRows, type ValidationResult } from '@/lib/csv/validate'
import { PropertyCreateSchema, type PropertyCreate } from '@/lib/schemas/property'
import { commitPropertyImport } from '../actions'

import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { PreviewTable } from './preview-table'

type Stage = 'upload' | 'preview' | 'committing' | 'done' | 'failed'

// Map CSV row → canonical schema fields. Tolerant of casing / spacing.
function mapPropertyRow(raw: ParsedRow): Record<string, unknown> {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const direct = raw[k]
      if (direct !== undefined && direct !== '') return direct
      const lower = raw[k.toLowerCase()]
      if (lower !== undefined && lower !== '') return lower
      const upper = raw[k.toUpperCase()]
      if (upper !== undefined && upper !== '') return upper
    }
    return ''
  }
  const truthy = (v: string) => ['true', 'yes', '1', 'y', 't'].includes(v.toLowerCase())

  return {
    entityId: pick('Entity ID', 'entity_id', 'entityId'),
    addressLine1: pick('Address line 1', 'address_line_1', 'address', 'addressLine1'),
    addressLine2: pick('Address line 2', 'address_line_2', 'addressLine2') || null,
    city: pick('City'),
    county: pick('County') || null,
    postcode: pick('Postcode', 'postcode', 'post_code'),
    localAuthority: pick('Local authority', 'local_authority', 'localAuthority') || null,
    kind: (pick('Kind') || 'hmo').toLowerCase().replace(/\s+/g, '_'),
    bedroomsTotal: pick('Bedrooms', 'bedrooms_total', 'bedrooms') || null,
    bathroomsTotal: pick('Bathrooms', 'bathrooms_total', 'bathrooms') || null,
    purchasePricePence: pick('Purchase price', 'purchase_price', 'price', 'purchasePricePence'),
    purchaseDate: pick('Purchase date', 'purchase_date', 'date', 'purchaseDate'),
    sdltPaidPence: pick('SDLT', 'sdlt_paid', 'sdltPaidPence') || null,
    refurbCostPence: pick('Refurb', 'refurb_cost', 'refurbCostPence') || null,
    acquisitionCostsPence: pick('Acquisition costs', 'acquisition_costs', 'acquisitionCostsPence') || null,
    epcRating: pick('EPC', 'epc_rating', 'epcRating') || null,
    epcExpiry: pick('EPC expiry', 'epc_expiry', 'epcExpiry') || null,
    hmoLicenceKind: (pick('HMO licence', 'hmo_licence', 'hmo_licence_kind') || 'none').toLowerCase(),
    hmoLicenceRef: pick('HMO ref', 'hmo_licence_ref') || null,
    hmoLicenceExpiry: pick('HMO expiry', 'hmo_licence_expiry') || null,
    hmoPermittedOccupancy: pick('HMO occupancy', 'hmo_permitted_occupancy') || null,
    article4Area: truthy(pick('Article 4', 'article_4', 'article_4_area')),
    isAascProperty: truthy(pick('AASC', 'is_aasc', 'is_aasc_property')),
    notes: pick('Notes') || null,
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
      const result = validateRows(parsed.rows, PropertyCreateSchema, mapPropertyRow)
      setValidation(result)
      setStage('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse file.')
    }
  }

  const commit = () => {
    if (!validation || validation.invalid.length > 0) return
    setStage('committing')
    setProgress({ done: 0, total: validation.valid.length })

    startTransition(async () => {
      const BATCH = 50
      for (let i = 0; i < validation.valid.length; i += BATCH) {
        const batch = validation.valid.slice(i, i + BATCH)
        const result = await commitPropertyImport(batch)
        if (!result.ok) {
          setError(result.error)
          setStage('failed')
          return
        }
        setProgress({
          done: Math.min(i + BATCH, validation.valid.length),
          total: validation.valid.length,
        })
      }
      setStage('done')
      setTimeout(() => router.push('/properties'), 1200)
    })
  }

  if (stage === 'upload') {
    return (
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 hover:bg-muted/50">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium">Drop a CSV file or click to choose</p>
            <p className="mt-1 text-xs text-muted-foreground">10MB max — see column reference below</p>
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
              <code>Entity ID</code> (uuid, required) — the entity that holds the property
            </li>
            <li>
              <code>Address line 1</code> (required), <code>Address line 2</code>
            </li>
            <li>
              <code>City</code> (required), <code>County</code>, <code>Postcode</code> (UK format)
            </li>
            <li>
              <code>Kind</code> — hmo | single_let | block | commercial | development | land (default hmo)
            </li>
            <li>
              <code>Purchase price</code> in £ (e.g. 250000 or £250,000)
            </li>
            <li>
              <code>Purchase date</code> in YYYY-MM-DD
            </li>
            <li>
              <code>EPC</code>, <code>EPC expiry</code>, <code>HMO licence</code>,{' '}
              <code>Article 4</code>, <code>AASC</code> — optional
            </li>
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
              <span className="ml-2 text-destructive">
                ({validation.invalid.length} need fixing)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStage('upload')}>
              Back
            </Button>
            <Button onClick={commit} disabled={!canCommit}>
              {canCommit
                ? `Import ${validation.valid.length} properties`
                : 'Fix errors to continue'}
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
      <div className="space-y-4 py-12 text-center">
        <p className="font-medium">Importing {progress.total} properties…</p>
        <div className="mx-auto h-2 max-w-md overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {progress.done} of {progress.total}
        </p>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div className="space-y-4 py-12 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <p className="font-medium">Imported {progress.done} properties</p>
        <p className="text-sm text-muted-foreground">Redirecting…</p>
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
