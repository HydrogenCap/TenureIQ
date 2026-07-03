// app/(app)/maintenance/_components/kanban-board.tsx
'use client'

import Link from 'next/link'
import { useState, useTransition, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { StatusBadge } from '@/components/status-badge'
import type { BoardStatus } from '@/lib/schemas/maintenance'
import { moveJob } from '../actions'

export type BoardJob = {
  id: string
  title: string
  priority: string
  status: string
  addressLine1: string | null
  postcode: string | null
  contractorName: string | null
}

export type BoardColumn = {
  status: BoardStatus
  label: string
  jobs: BoardJob[]
}

export function KanbanBoard({ columns }: { columns: BoardColumn[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [hovered, setHovered] = useState<BoardStatus | null>(null)

  function handleDrop(toStatus: BoardStatus, e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setHovered(null)
    if (pending) return
    const jobId = e.dataTransfer.getData('text/plain')
    if (!jobId) return
    startTransition(async () => {
      const result = await moveJob({ jobId, toStatus })
      if (result.ok) {
        setError(null)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault()
              if (hovered !== col.status) setHovered(col.status)
            }}
            onDragLeave={(e) => {
              const related = e.relatedTarget
              if (related instanceof Node && e.currentTarget.contains(related)) return
              setHovered((h) => (h === col.status ? null : h))
            }}
            onDrop={(e) => handleDrop(col.status, e)}
            className={`flex w-72 shrink-0 flex-col rounded-lg border ${
              hovered === col.status
                ? 'border-primary/60 bg-primary/5'
                : 'border-border bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h2 className="text-sm font-semibold">{col.label}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {col.jobs.length}
              </span>
            </div>
            <div className="max-h-[70vh] flex-1 space-y-2 overflow-y-auto p-2">
              {col.jobs.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  No jobs
                </p>
              ) : (
                col.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    columnStatus={col.status}
                    pending={pending}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function JobCard({
  job,
  columnStatus,
  pending,
}: {
  job: BoardJob
  columnStatus: BoardStatus
  pending: boolean
}) {
  // Completed (and cancelled, defensively) cards never leave their
  // column — moveJob refuses the transition server-side too.
  const draggable =
    !pending && job.status !== 'completed' && job.status !== 'cancelled'
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', job.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={`rounded-md border bg-card p-3 shadow-sm ${
        draggable
          ? 'cursor-grab active:cursor-grabbing'
          : pending
            ? 'opacity-60'
            : 'opacity-80'
      }`}
    >
      <Link
        href={`/maintenance/${job.id}`}
        className="text-sm font-medium leading-snug hover:underline"
      >
        {job.title}
      </Link>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={job.priority} />
        {job.status !== columnStatus && <StatusBadge status={job.status} />}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {job.addressLine1 ?? '—'}
        {job.postcode ? `, ${job.postcode}` : ''}
      </p>
      {job.contractorName && (
        <p className="text-xs text-muted-foreground">{job.contractorName}</p>
      )}
    </div>
  )
}
