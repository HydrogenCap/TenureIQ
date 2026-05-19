'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import {
  createShareholder,
  deleteShareholder,
} from '../../actions'
import { SHARE_CLASSES } from '@/lib/schemas/shareholder'

export type ShareholderVm = {
  id: string
  name: string
  shareCount: number
  shareClass: string
  isDirector: boolean
  appointedDate: string | null
  resignedDate: string | null
}

const SHARE_CLASS_LABELS: Record<string, string> = {
  ordinary: 'Ordinary',
  preference: 'Preference',
  a_ordinary: 'A Ordinary',
  b_ordinary: 'B Ordinary',
  other: 'Other',
}

function classLabel(code: string): string {
  return SHARE_CLASS_LABELS[code] ?? code
}

export function ShareholdersTab({
  entityId,
  initial,
  canManage,
  canDelete,
}: {
  entityId: string
  initial: ShareholderVm[]
  canManage: boolean
  canDelete: boolean
}) {
  const router = useRouter()
  const [shareholders, setShareholders] = useState<ShareholderVm[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)

  const totalShares = shareholders
    .filter((s) => s.resignedDate === null)
    .reduce((sum, s) => sum + s.shareCount, 0)

  const onSubmit = (data: FormData) => {
    setError(null)
    startTransition(async () => {
      const r = await createShareholder({
        entityId,
        name: data.get('name'),
        shareCount: data.get('shareCount'),
        shareClass: data.get('shareClass'),
        isDirector: data.get('isDirector') === 'on',
        appointedDate: data.get('appointedDate') || null,
        resignedDate: data.get('resignedDate') || null,
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setFormOpen(false)
      router.refresh()
    })
  }

  const onDelete = (id: string) => {
    if (!confirm('Remove this shareholder?')) return
    setError(null)
    startTransition(async () => {
      const r = await deleteShareholder(id, entityId)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setShareholders((prev) => prev.filter((s) => s.id !== id))
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {shareholders.length === 0 && !formOpen ? (
        <EmptyState
          title="No shareholders recorded"
          description="Add the entity's shareholders for Companies-House parity."
          action={
            canManage ? (
              <Button onClick={() => setFormOpen(true)}>+ Add shareholder</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {shareholders.length} shareholder{shareholders.length === 1 ? '' : 's'} ·{' '}
              {totalShares.toLocaleString('en-GB')} shares total (active)
            </p>
            {canManage && !formOpen && (
              <Button onClick={() => setFormOpen(true)} variant="outline" size="sm">
                + Add shareholder
              </Button>
            )}
          </div>

          {shareholders.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead>Director?</TableHead>
                  <TableHead>Appointed</TableHead>
                  <TableHead>Resigned</TableHead>
                  {canDelete && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shareholders.map((s) => (
                  <TableRow key={s.id} className={s.resignedDate ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm">{classLabel(s.shareClass)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.shareCount.toLocaleString('en-GB')}
                    </TableCell>
                    <TableCell className="text-sm">{s.isDirector ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="text-sm">{s.appointedDate ?? '—'}</TableCell>
                    <TableCell className="text-sm">{s.resignedDate ?? '—'}</TableCell>
                    {canDelete && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => onDelete(s.id)}
                          aria-label={`Remove ${s.name}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      {formOpen && canManage && (
        <form
          action={onSubmit}
          className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" required disabled={isPending} />
          </div>
          <div>
            <Label htmlFor="shareCount">Share count *</Label>
            <Input
              id="shareCount"
              name="shareCount"
              type="number"
              min="0"
              required
              defaultValue="0"
              disabled={isPending}
            />
          </div>
          <div>
            <Label htmlFor="shareClass">Class</Label>
            <Select id="shareClass" name="shareClass" defaultValue="ordinary" disabled={isPending}>
              {SHARE_CLASSES.map((code) => <option key={code} value={code}>{classLabel(code)}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="appointedDate">Appointed</Label>
            <Input id="appointedDate" name="appointedDate" type="date" disabled={isPending} />
          </div>
          <div>
            <Label htmlFor="resignedDate">Resigned</Label>
            <Input id="resignedDate" name="resignedDate" type="date" disabled={isPending} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="isDirector" name="isDirector" disabled={isPending} />
            <Label htmlFor="isDirector" className="text-sm font-normal">
              Also a director
            </Label>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Add shareholder'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
