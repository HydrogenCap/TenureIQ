// lib/email/send.ts
// Provider abstraction. Resend in prod, `console` in dev / test.
//
// We pick the provider from `EMAIL_PROVIDER` (resend | console). The
// `console` provider logs the rendered subject + body to stdout and
// returns success — useful for end-to-end tests that don't need real
// email delivery.

import 'server-only'
import { env } from '@/env'

export type SendInput = {
  to: string
  subject: string
  html: string
  text: string
  from?: string
}

export type SendResult =
  | { ok: true; id: string; provider: 'resend' | 'console' }
  | { ok: false; error: string; provider: 'resend' | 'console' }

type ResendResponse = { id?: string; message?: string }

async function sendViaResend(input: SendInput): Promise<SendResult> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured', provider: 'resend' }
  }
  const from = input.from ?? env.EMAIL_FROM ?? 'TenureIQ <noreply@tenureiq.app>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as ResendResponse
    if (!res.ok) {
      return {
        ok: false,
        error: body.message ?? `Resend HTTP ${res.status}`,
        provider: 'resend',
      }
    }
    if (!body.id) {
      return { ok: false, error: 'Resend returned no id', provider: 'resend' }
    }
    return { ok: true, id: body.id, provider: 'resend' }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      provider: 'resend',
    }
  }
}

function sendViaConsole(input: SendInput): SendResult {
  // eslint-disable-next-line no-console
  console.log('--- TenureIQ email (console provider) ---')
  // eslint-disable-next-line no-console
  console.log(`To:      ${input.to}`)
  // eslint-disable-next-line no-console
  console.log(`Subject: ${input.subject}`)
  // eslint-disable-next-line no-console
  console.log('--- text body ---')
  // eslint-disable-next-line no-console
  console.log(input.text)
  // eslint-disable-next-line no-console
  console.log('--- end ---')
  return {
    ok: true,
    id: `console-${Date.now().toString(36)}`,
    provider: 'console',
  }
}

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const provider = env.EMAIL_PROVIDER ?? 'console'
  if (provider === 'resend') return sendViaResend(input)
  return sendViaConsole(input)
}
