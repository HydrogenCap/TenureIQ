'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'

import { parseCsv } from '@/lib/csv/parse'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { createImport, type CreateImportResult } from '../actions'

type Stage = 'pick-account' | 'upload' | 'committing' | 'done' | 'failed'

type BankOpt = { id: string; name: string }

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
  const [, startTransition] = useTransition()

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
    setStage('committing')
    try {
      const parsed = await parseCsv(file)
      startTransition(async () => {
        const r = await createImport({
          bankAccountId,
          filename: file.name,
          headers: parsed.headers,
          rows: parsed.rows,
        })
        if (!r.ok) {
          setError(r.error)
          setStage('failed')
          return
        }
        setResult(r.data)
        setStage('done')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'parse failed')
      setStage('failed')
    }
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
