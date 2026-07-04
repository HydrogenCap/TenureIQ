'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PlanLimitAlert } from '@/components/plan-limit-alert'
import { FormSection } from '@/components/form-section'
import { FormField } from '@/components/form-field'
import { DOCUMENT_KINDS, type DocumentKind } from '@/lib/schemas/document'
import { registerDocument } from '../../actions'

type Opt = { id: string; name: string }

type Props = {
  organisationId: string
  supabaseUrl: string
  supabaseAnonKey: string
  properties: Opt[]
  initialPropertyId?: string
}

const KIND_LABELS: Record<DocumentKind, string> = {
  gas_safety: 'Gas safety',
  eicr: 'EICR',
  epc: 'EPC',
  pat: 'PAT testing',
  hmo_licence: 'HMO licence',
  fire_risk_assessment: 'Fire risk assessment',
  fire_alarm_test: 'Fire alarm test',
  fire_alarm: 'Fire alarm',
  emergency_lighting: 'Emergency lighting',
  legionella: 'Legionella risk',
  asbestos_survey: 'Asbestos survey',
  oil_safety: 'Oil safety',
  co_alarm: 'CO alarm',
  smoke_alarm: 'Smoke alarm',
  deposit_protection: 'Deposit protection',
  right_to_rent: 'Right to rent',
  tenancy_agreement: 'Tenancy agreement',
  tenancy_addendum: 'Tenancy addendum',
  invoice: 'Invoice',
  quote: 'Quote',
  inspection_report: 'Inspection report',
  lease: 'Lease',
  lender_offer: 'Lender offer',
  mortgage_statement: 'Mortgage statement',
  valuation_report: 'Valuation report',
  letter: 'Letter',
  other: 'Other',
}

const MAX_BYTES = 50 * 1024 * 1024

export function UploadForm({
  organisationId,
  supabaseUrl,
  supabaseAnonKey,
  properties,
  initialPropertyId,
}: Props) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<DocumentKind | ''>('')
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [planLimit, setPlanLimit] = useState<string | null>(null)
  const [progress, setProgress] = useState<'idle' | 'uploading' | 'registering'>('idle')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!file) {
      setError('Pick a file.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('File exceeds 50MB.')
      return
    }
    if (!propertyId) {
      setError('Link the document to a property.')
      return
    }
    startTransition(async () => {
      try {
        const sb = createBrowserClient(supabaseUrl, supabaseAnonKey)
        const docId = crypto.randomUUID()
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
        const path = `${organisationId}/${propertyId}/${docId}.${ext}`
        setProgress('uploading')
        const up = await sb.storage
          .from('documents')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (up.error) {
          setError(`Upload failed: ${up.error.message}`)
          setProgress('idle')
          return
        }
        setProgress('registering')
        const result = await registerDocument({
          storagePath: path,
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          kind: kind || null,
          propertyId,
          unitId: null,
          tenancyId: null,
          mortgageId: null,
        })
        if (!result.ok) {
          // Plan quota refusals carry fieldErrors._plan — offer the
          // upgrade path rather than a dead-end error.
          if (result.fieldErrors && '_plan' in result.fieldErrors) {
            setPlanLimit(result.error)
          } else {
            setError(result.error)
          }
          setProgress('idle')
          return
        }
        router.push(`/documents/${result.data.id}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'unknown')
        setProgress('idle')
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      {planLimit && <PlanLimitAlert message={planLimit} />}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <FormSection title="File">
        <FormField label="Document" required htmlFor="d-file" fullWidth>
          <Input
            id="d-file"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </FormField>
        {file && (
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}
          </p>
        )}
      </FormSection>

      <FormSection title="Classification">
        <FormField label="Property" required htmlFor="d-prop" fullWidth>
          <Select
            id="d-prop"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
          >
            <option value="">Select a property…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Kind" hint="Compliance kinds trigger OCR auto-extraction." htmlFor="d-kind" fullWidth>
          <Select
            id="d-kind"
            value={kind}
            onChange={(e) => setKind((e.target.value as DocumentKind) || '')}
          >
            <option value="">— Pick a kind —</option>
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </Select>
        </FormField>
      </FormSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !file || !propertyId}>
          {pending
            ? progress === 'uploading' ? 'Uploading…' : 'Saving…'
            : 'Upload'}
        </Button>
      </div>
    </form>
  )
}
