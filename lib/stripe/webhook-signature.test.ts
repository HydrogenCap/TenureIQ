import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyStripeSignature } from './webhook-signature'

const SECRET = 'whsec_testsecret_DO_NOT_USE_IN_PROD'
const BODY = '{"id":"evt_test","type":"customer.subscription.created"}'

function sign(timestamp: number, body: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')
}

describe('verifyStripeSignature', () => {
  it('accepts a fresh, well-formed signature', () => {
    const t = Math.floor(Date.now() / 1000)
    const v1 = sign(t, BODY, SECRET)
    const r = verifyStripeSignature({
      rawBody: BODY,
      signatureHeader: `t=${t},v1=${v1}`,
      secret: SECRET,
      now: t * 1000,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.timestamp).toBe(t)
  })

  it('rejects when header is missing', () => {
    const r = verifyStripeSignature({
      rawBody: BODY,
      signatureHeader: null,
      secret: SECRET,
    })
    expect(r).toEqual({ ok: false, reason: 'missing' })
  })

  it('rejects malformed header (no t)', () => {
    const r = verifyStripeSignature({
      rawBody: BODY,
      signatureHeader: 'v1=abcdef',
      secret: SECRET,
    })
    expect(r).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects wrong signature', () => {
    const t = Math.floor(Date.now() / 1000)
    const r = verifyStripeSignature({
      rawBody: BODY,
      signatureHeader: `t=${t},v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`,
      secret: SECRET,
      now: t * 1000,
    })
    expect(r).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('rejects wrong-length signature', () => {
    const t = Math.floor(Date.now() / 1000)
    const r = verifyStripeSignature({
      rawBody: BODY,
      signatureHeader: `t=${t},v1=short`,
      secret: SECRET,
      now: t * 1000,
    })
    expect(r).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('rejects expired timestamps (> 5 min skew)', () => {
    const t = Math.floor(Date.now() / 1000)
    const v1 = sign(t, BODY, SECRET)
    const r = verifyStripeSignature({
      rawBody: BODY,
      signatureHeader: `t=${t},v1=${v1}`,
      secret: SECRET,
      now: (t + 10 * 60) * 1000, // 10 min after signing
    })
    expect(r).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts multiple v1 candidates — passes if any matches', () => {
    const t = Math.floor(Date.now() / 1000)
    const good = sign(t, BODY, SECRET)
    const bad = 'a'.repeat(good.length)
    const r = verifyStripeSignature({
      rawBody: BODY,
      signatureHeader: `t=${t},v1=${bad},v1=${good}`,
      secret: SECRET,
      now: t * 1000,
    })
    expect(r.ok).toBe(true)
  })
})
