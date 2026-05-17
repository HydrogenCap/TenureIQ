'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FormField } from '@/components/form-field'
import { confirmExtraction, rejectExtraction } from '../../actions'
import type { DocumentKind } from '@/lib/schemas/document'

type Props = {
  documentId: string
  kind: DocumentKind
  extracted: { issueDate?: string; expiryDate?: string; issuer?: string } | null
}

function isoOnly(d?: string): string {
  if (!d) return ''
  // Accepts ISO YYYY-MM-DD or full ISO timestamp.
  return d.slice(0, 10)
}

export function ConfirmExtractionPanel({ documentId, kind, extracted }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [issueDate, setIssueDate] = useState(isoOnly(extracted?.issueDate))
  const [expiryDate, setExpiryDate] = useState(isoOnly(extracted?.expiryDate))
  const [issuer, setIssuer] = useState(extracted?.issuer ?? '')
  const [notes, setNotes] = useState('')

  const onConfirm = () => {
    setError(null)
    startTransition(async () => {
      const result = await confirmExtraction({
        documentId,
        kind,
        issueDate: issueDate || null,
        expiryDate: expiryDate || null,
        issuer: issuer || null,
        notes: notes || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/compliance/${result.data.complianceItemId}`)
    })
  }

  const onReject = () => {
    setError(null)
    startTransition(async () => {
      const result = await rejectExtraction(documentId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-md border bg-card p-4">
      <h3 className="mb-3 font-medium">Confirm extracted fields</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        OCR pre-filled these from the document. Review and confirm — this creates a
        compliance item and links it back here. Wrong dates have legal consequences,
        so we never auto-create without your nod (unless your org has opted into
        high-confidence auto-confirm).
      </p>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Issue date" htmlFor="ce-issue">
          <Input
            id="ce-issue"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </FormField>
        <FormField label="Expiry date" htmlFor="ce-expiry">
          <Input
            id="ce-expiry"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </FormField>
        <FormField label="Issuer / engineer" htmlFor="ce-issuer" fullWidth>
          <Input id="ce-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
        </FormField>
        <FormField label="Notes" htmlFor="ce-notes" fullWidth>
          <Textarea
            id="ce-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onReject} disabled={pending}>
          Not a {kind.replace(/_/g, ' ')}
        </Button>
        <Button type="button" onClick={onConfirm} disabled={pending}>
          {pending ? 'Saving…' : 'Confirm + create compliance item'}
        </Button>
      </div>
    </div>
  )
}
