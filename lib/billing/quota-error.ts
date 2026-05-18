// lib/billing/quota-error.ts
// Helper that translates a Postgres P0001 'quota_exceeded' raise from
// the quota trigger (migration 20260515000019) into a user-friendly
// error message.
//
// The TS-side can.ts gate runs first and catches the over-limit case
// before the insert in the common case. The DB trigger is the safety
// net for the rare concurrent-insert race — when it fires, we just
// need to surface a clean message; the user has already seen the
// upgrade prompt earlier in the funnel.

// Loose shape: supabase-js exposes `code` for SQLSTATE on PostgrestError;
// `message` is always present.
type PgErrorLike = { code?: string | null; message?: string | null } | null | undefined

export function isQuotaExceededError(err: PgErrorLike): boolean {
  if (!err) return false
  if (typeof err.message !== 'string') return false
  return err.message.includes('quota_exceeded')
}

export type QuotaResource = 'properties' | 'documents' | 'ocr-runs'

const RESOURCE_LABEL: Record<QuotaResource, string> = {
  properties: 'properties',
  documents: 'documents',
  'ocr-runs': 'OCR runs this month',
}

export function quotaErrorMessage(resource: QuotaResource): string {
  return `You've hit your ${RESOURCE_LABEL[resource]} limit. Upgrade your plan in Settings → Billing to continue.`
}
