// lib/email/templates/index.ts
// Registry of email templates. The cron route looks up the template by
// `body_key`, calls the renderer with the reminder's `context`, and
// passes the result to sendEmail().

import {
  renderComplianceReminder,
  type ComplianceReminderContext,
} from './compliance-reminder'
import {
  renderAascBreakReminder,
  type AascBreakReminderContext,
} from './aasc-break-reminder'
import {
  renderAascEndReminder,
  type AascEndReminderContext,
} from './aasc-end-reminder'

export type Rendered = { subject: string; html: string; text: string }

// One key → one renderer. Adding a template = adding a row here +
// a sibling .ts file. Body keys are the strings that enqueue functions
// in supabase/migrations/*.sql write into reminders.body_key.
export const TEMPLATE_REGISTRY = {
  compliance_reminder: (ctx: unknown): Rendered =>
    renderComplianceReminder(ctx as ComplianceReminderContext),
  aasc_break_reminder: (ctx: unknown): Rendered =>
    renderAascBreakReminder(ctx as AascBreakReminderContext),
  aasc_end_reminder: (ctx: unknown): Rendered =>
    renderAascEndReminder(ctx as AascEndReminderContext),
} as const

export type TemplateKey = keyof typeof TEMPLATE_REGISTRY

export function isTemplateKey(key: string): key is TemplateKey {
  return key in TEMPLATE_REGISTRY
}

export function renderTemplate(key: string, context: unknown): Rendered | null {
  if (!isTemplateKey(key)) return null
  return TEMPLATE_REGISTRY[key](context)
}
