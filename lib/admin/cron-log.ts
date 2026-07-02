// lib/admin/cron-log.ts
// Owner-only reads of the cron_run_log observability table. Service-
// role allowed here (lib/admin/ is in the convention's allowed paths).

import 'server-only'
import { supabaseService } from '@/lib/db/admin'

export type CronRunRow = {
  id: string
  job: string
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'ok' | 'failed'
  processed: number
  failed: number
  notes: string | null
  errorMessage: string | null
}

type DbRow = {
  id: number | string
  job: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'failed'
  processed: number
  failed: number
  notes: string | null
  error_message: string | null
}

export async function recentCronRuns(limit = 50): Promise<CronRunRow[]> {
  const sb = supabaseService()
  const { data, error } = await sb
    .from('cron_run_log')
    .select('id, job, started_at, finished_at, status, processed, failed, notes, error_message')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('recentCronRuns failed', error)
    return []
  }
  const rows = (data ?? []) as DbRow[]
  return rows.map((r) => ({
    id: typeof r.id === 'number' ? String(r.id) : r.id,
    job: r.job,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    status: r.status,
    processed: r.processed,
    failed: r.failed,
    notes: r.notes,
    errorMessage: r.error_message,
  }))
}
