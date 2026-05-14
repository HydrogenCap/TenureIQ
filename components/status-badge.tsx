// components/status-badge.tsx
// The single home for status → colour mapping. New status strings must be
// added here; never invent inline colours.

import { Badge } from '@/components/ui/badge'

type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'secondary' | 'outline'

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  // Compliance
  valid: 'success',
  expiring: 'warning',
  expired: 'destructive',
  missing: 'destructive',
  exempt: 'muted',
  // MEES / EPC
  compliant: 'success',
  let_blocked: 'destructive',
  epc_expired: 'destructive',
  epc_missing: 'warning',
  // Tenancies
  active: 'success',
  ended: 'muted',
  notice_given: 'warning',
  terminated: 'destructive',
  // Units / Properties
  occupied: 'success',
  vacant: 'warning',
  reserved: 'default',
  maintenance: 'warning',
  offline: 'muted',
  // AASC areas
  open: 'success',
  limited: 'warning',
  closed: 'destructive',
  unknown: 'muted',
  // Maintenance jobs
  reported: 'warning',
  triaged: 'default',
  in_progress: 'default',
  awaiting_quote: 'warning',
  completed: 'success',
  cancelled: 'muted',
  // Property kinds (informational, not status)
  hmo: 'default',
  single_let: 'secondary',
  block: 'secondary',
  commercial: 'secondary',
  development: 'secondary',
  land: 'muted',
}

const STATUS_LABEL: Record<string, string> = {
  hmo: 'HMO',
  single_let: 'Single let',
  let_blocked: 'Let blocked',
  epc_expired: 'EPC expired',
  epc_missing: 'EPC missing',
  notice_given: 'Notice given',
  in_progress: 'In progress',
  awaiting_quote: 'Awaiting quote',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = STATUS_VARIANT[status] ?? 'default'
  const label = STATUS_LABEL[status] ?? status.replace(/_/g, ' ')
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}
