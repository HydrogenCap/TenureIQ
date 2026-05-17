// lib/email/templates/index.ts
// Registry of email templates. The cron route looks up the template by
// `body_key`, calls the renderer with the reminder's `context`, and
// passes the result to sendEmail().

import {
  renderComplianceReminder,
  type ComplianceReminderContext,
} from './compliance-reminder'

export type Rendered = { subject: string; html: string; text: string }

// One key → one renderer. Adding a template = adding a row here +
// a sibling .ts file.
export const TEMPLATE_REGISTRY = {
  compliance_reminder: (ctx: unknown): Rendered =>
    renderComplianceReminder(ctx as ComplianceReminderContext),
} as const

export type TemplateKey = keyof typeof TEMPLATE_REGISTRY

export function isTemplateKey(key: string): key is TemplateKey {
  return key in TEMPLATE_REGISTRY
}

export function renderTemplate(key: string, context: unknown): Rendered | null {
  if (!isTemplateKey(key)) return null
  return TEMPLATE_REGISTRY[key](context)
}
