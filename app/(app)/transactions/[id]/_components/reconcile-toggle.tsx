'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateDisplay } from '@/components/date-display'
import { setTransactionReconciled } from '../../actions'

export function ReconcileToggle({
  transactionId,
  initialReconciledAt,
  canEdit,
}: {
  transactionId: string
  initialReconciledAt: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [reconciledAt, setReconciledAt] = useState<string | null>(initialReconciledAt)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const onToggle = () => {
    setError(null)
    const next = reconciledAt === null
    startTransition(async () => {
      const r = await setTransactionReconciled(transactionId, next)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setReconciledAt(next ? new Date().toISOString() : null)
      router.refresh()
    })
  }

  if (reconciledAt) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950">
        <Check className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden />
        <span className="font-medium text-emerald-900 dark:text-emerald-100">Reconciled</span>
        <span className="text-xs text-emerald-700 dark:text-emerald-300">
          <DateDisplay date={reconciledAt} formatStr="d MMM yyyy, HH:mm" />
        </span>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={onToggle}
            className="ml-auto"
          >
            <X className="mr-1 h-3 w-3" aria-hidden />
            Unreconcile
          </Button>
        )}
        {error && <span className="ml-2 text-xs text-destructive">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm">
      <span className="text-muted-foreground">Not yet reconciled against a bank statement.</span>
      {canEdit && (
        <Button variant="outline" size="sm" disabled={isPending} onClick={onToggle}>
          {isPending ? 'Marking…' : 'Mark reconciled'}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
