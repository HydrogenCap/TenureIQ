// lib/domain/notifications.ts
// Pure mapping from `reminders` rows to in-app notification items for the
// header bell. No schema changes: the notification centre is a read-only
// projection of the reminder queue, so titles are derived from body_key +
// the enqueue-time context json (see supabase/migrations/*_m06/_m08/_m09).
//
// Deliberately does NOT import lib/email/templates — those renderers are
// server/send-time code and this module is imported by a client component
// (for relativeTime and the NotificationItem type), so it must stay a
// dependency-free pure module.

export type NotificationStatus = 'pending' | 'sent'

export type NotificationItem = {
  id: string
  title: string
  detail: string | null
  href: string
  /** ISO timestamp of reminders.trigger_at */
  triggerAt: string
  status: NotificationStatus
}

/** The subset of a reminders row the mapper needs (snake_case, as queried). */
export type ReminderRow = {
  id: string
  related_kind: string
  related_id: string
  body_key: string
  context: unknown
  trigger_at: string
  status: string
}

// Duplicated from lib/email/templates/compliance-reminder.ts on purpose —
// importing that module would drag email renderers into the client bundle.
// Keep the two maps in sync when adding compliance kinds.
const COMPLIANCE_KIND_LABELS: Record<string, string> = {
  gas_safety: 'Gas safety certificate',
  eicr: 'EICR (electrical safety)',
  epc: 'EPC',
  pat: 'PAT testing',
  hmo_licence: 'HMO licence',
  fire_risk_assessment: 'Fire risk assessment',
  fire_alarm_test: 'Fire alarm test',
  fire_alarm: 'Fire alarm system',
  emergency_lighting: 'Emergency lighting',
  legionella: 'Legionella risk assessment',
  asbestos: 'Asbestos survey',
  asbestos_survey: 'Asbestos survey',
  oil_safety: 'Oil safety certificate',
  co_alarm: 'CO alarm certificate',
  smoke_alarm: 'Smoke alarm certificate',
  deposit_protection: 'Deposit protection',
  right_to_rent: 'Right-to-rent check',
  insurance: 'Insurance',
  other: 'Compliance item',
}

// context arrives as arbitrary Json from Postgres — narrow defensively
// rather than trusting the enqueue functions never change shape.
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function ctxString(ctx: Record<string, unknown>, key: string): string | null {
  const v = ctx[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

function ctxNumber(ctx: Record<string, unknown>, key: string): number | null {
  const v = ctx[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function humanise(key: string): string {
  const words = key.replace(/_/g, ' ').trim()
  return words.length > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : 'Reminder'
}

function dayWord(n: number): string {
  return n === 1 || n === -1 ? 'day' : 'days'
}

/**
 * Route a notification to the record it is about. Kinds come from the
 * enqueue functions in supabase/migrations (plus the schema comment's
 * mortgage/tenancy for future engines). Unknown kinds land on /dashboard
 * rather than a 404.
 */
export function hrefForRelated(relatedKind: string, relatedId: string): string {
  switch (relatedKind) {
    case 'compliance':
      return `/compliance/${relatedId}`
    case 'mortgage':
      return `/mortgages/${relatedId}`
    case 'tenancy':
      return `/tenancies/${relatedId}`
    case 'aasc_break':
    case 'aasc_end':
      // related_id is the aasc_contracts row.
      return `/aasc/contracts/${relatedId}`
    case 'contractor_insurance':
      // related_id is the contractors row.
      return `/contractors/${relatedId}`
    default:
      return '/dashboard'
  }
}

type TitleDetail = { title: string; detail: string | null }

function complianceSummary(ctx: Record<string, unknown>): TitleDetail {
  const kind = ctxString(ctx, 'kind')
  const label = kind ? (COMPLIANCE_KIND_LABELS[kind] ?? humanise(kind)) : 'Compliance item'
  const days = ctxNumber(ctx, 'days_until')

  let title: string
  if (days === null) title = `${label} expiry reminder`
  else if (days > 0) title = `${label} expires in ${days} ${dayWord(days)}`
  else if (days === 0) title = `${label} expires today`
  else title = `${label} expired ${-days} ${dayWord(days)} ago`

  // property_label is only present once the cron has enriched the context;
  // enqueue-time rows carry property_id only, so fall back gracefully.
  const propertyLabel = ctxString(ctx, 'property_label')
  const expiry = ctxString(ctx, 'expiry_date')
  const parts = [propertyLabel, expiry ? `due ${expiry}` : null].filter(
    (p): p is string => p !== null,
  )
  return { title, detail: parts.length > 0 ? parts.join(' · ') : null }
}

function aascBreakSummary(ctx: Record<string, unknown>): TitleDetail {
  const contractor = ctxString(ctx, 'contractor')
  const subject = contractor ? `${contractor} contract` : 'AASC contract'
  const days = ctxNumber(ctx, 'days_until')

  let title: string
  if (days === null) title = `${subject} break clause approaching`
  else if (days > 0) title = `${subject} break clause in ${days} ${dayWord(days)}`
  else if (days === 0) title = `${subject} break clause today`
  else title = `${subject} break clause ${-days} ${dayWord(days)} ago`

  const date = ctxString(ctx, 'break_clause_date')
  return { title, detail: date ? `break clause ${date}` : null }
}

function aascEndSummary(ctx: Record<string, unknown>): TitleDetail {
  const contractor = ctxString(ctx, 'contractor')
  const subject = contractor ? `${contractor} contract` : 'AASC contract'
  const days = ctxNumber(ctx, 'days_until')

  let title: string
  if (days === null) title = `${subject} end date approaching`
  else if (days > 0) title = `${subject} ends in ${days} ${dayWord(days)}`
  else if (days === 0) title = `${subject} ends today`
  else title = `${subject} ended ${-days} ${dayWord(days)} ago`

  const date = ctxString(ctx, 'end_date')
  return { title, detail: date ? `ends ${date}` : null }
}

function contractorInsuranceSummary(ctx: Record<string, unknown>): TitleDetail {
  const name = ctxString(ctx, 'contractor_name') ?? 'Contractor'
  const days = ctxNumber(ctx, 'days_until')

  let title: string
  if (days === null) title = `${name} insurance expiry reminder`
  else if (days > 0) title = `${name} insurance expires in ${days} ${dayWord(days)}`
  else if (days === 0) title = `${name} insurance expires today`
  else title = `${name} insurance expired ${-days} ${dayWord(days)} ago`

  const expiry = ctxString(ctx, 'insurance_expiry')
  return { title, detail: expiry ? `due ${expiry}` : null }
}

function summarise(bodyKey: string, context: unknown): TitleDetail {
  const ctx = asRecord(context)
  switch (bodyKey) {
    case 'compliance_reminder':
      return complianceSummary(ctx)
    case 'aasc_break_reminder':
      return aascBreakSummary(ctx)
    case 'aasc_end_reminder':
      return aascEndSummary(ctx)
    case 'contractor_insurance_reminder':
      return contractorInsuranceSummary(ctx)
    default:
      // New body_keys degrade to a readable generic line instead of hiding
      // the notification or crashing the panel.
      return { title: humanise(bodyKey), detail: null }
  }
}

export function mapReminderToNotification(row: ReminderRow): NotificationItem {
  const { title, detail } = summarise(row.body_key, row.context)
  return {
    id: row.id,
    title,
    detail,
    href: hrefForRelated(row.related_kind, row.related_id),
    triggerAt: row.trigger_at,
    // The action only queries sent|pending; anything unexpected is treated
    // as pending (not yet delivered) rather than widening the union.
    status: row.status === 'sent' ? 'sent' : 'pending',
  }
}

/**
 * Compact relative time for the panel: '3d ago', 'in 2d', '5m ago', 'now'.
 * `now` is injectable so tests are deterministic.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diffMs = t - now.getTime()
  const abs = Math.abs(diffMs)

  const MINUTE = 60_000
  const HOUR = 3_600_000
  const DAY = 86_400_000

  if (abs < MINUTE) return 'now'

  let n: number
  let unit: string
  if (abs < HOUR) {
    n = Math.round(abs / MINUTE)
    unit = 'm'
  } else if (abs < DAY) {
    n = Math.round(abs / HOUR)
    unit = 'h'
  } else {
    n = Math.round(abs / DAY)
    unit = 'd'
  }
  return diffMs < 0 ? `${n}${unit} ago` : `in ${n}${unit}`
}
