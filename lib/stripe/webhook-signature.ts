// lib/stripe/webhook-signature.ts
// Stripe webhook signature verification using node:crypto.
// Stripe sends a Stripe-Signature header of the form:
//   t=1234567890,v1=abcdef..,v1=...,v0=...
// where v1 is the current scheme: HMAC-SHA256 of `${t}.${rawBody}`
// keyed by the webhook signing secret.
//
// Per the official docs we must:
//   1. Extract timestamp + signatures.
//   2. Re-derive the expected signature from the raw payload.
//   3. timingSafeEqual the candidate signatures.
//   4. Reject when timestamp drift exceeds the tolerance (5 min).
//
// We do NOT use the Stripe SDK — keeps the dependency surface smaller
// for v1. Swap in stripe.webhooks.constructEvent when the SDK is in.

import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_MS = 5 * 60 * 1000

export type VerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'mismatch' | 'expired' }

export function verifyStripeSignature(input: {
  rawBody: string
  signatureHeader: string | null
  secret: string
  now?: number
}): VerifyResult {
  if (!input.signatureHeader) return { ok: false, reason: 'missing' }
  const parts = input.signatureHeader.split(',').reduce<Record<string, string[]>>(
    (acc, part) => {
      const [k, v] = part.split('=', 2)
      if (k && v) {
        const arr = acc[k] ?? []
        arr.push(v)
        acc[k] = arr
      }
      return acc
    },
    {},
  )
  const tStr = parts.t?.[0]
  const v1s = parts.v1 ?? []
  if (!tStr || v1s.length === 0) return { ok: false, reason: 'malformed' }

  const t = Number(tStr)
  if (!Number.isFinite(t)) return { ok: false, reason: 'malformed' }

  const expected = createHmac('sha256', input.secret)
    .update(`${tStr}.${input.rawBody}`, 'utf8')
    .digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')

  // Try each provided v1 signature; pass if any matches in
  // constant time.
  let matched = false
  for (const candidate of v1s) {
    const candBuf = Buffer.from(candidate, 'utf8')
    if (candBuf.length !== expectedBuf.length) {
      // Run a stable-cost compare to avoid leaking length difference.
      timingSafeEqual(expectedBuf, expectedBuf)
      continue
    }
    if (timingSafeEqual(candBuf, expectedBuf)) {
      matched = true
      break
    }
  }
  if (!matched) return { ok: false, reason: 'mismatch' }

  const now = input.now ?? Date.now()
  // Stripe `t` is in seconds.
  if (Math.abs(now - t * 1000) > TOLERANCE_MS) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, timestamp: t }
}
