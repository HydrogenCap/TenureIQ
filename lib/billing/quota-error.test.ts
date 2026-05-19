import { describe, it, expect } from 'vitest'
import { isQuotaExceededError, quotaErrorMessage } from './quota-error'

describe('isQuotaExceededError', () => {
  it('matches the trigger raise with the quota_exceeded marker', () => {
    expect(
      isQuotaExceededError({
        code: 'P0001',
        message: 'quota_exceeded: free plan caps properties at 3',
      }),
    ).toBe(true)
  })

  it('matches by message alone if the code is absent (some envelopes drop it)', () => {
    expect(isQuotaExceededError({ message: 'quota_exceeded: starter plan caps documents at 100' })).toBe(true)
  })

  it('does not match an unrelated Postgres error', () => {
    expect(isQuotaExceededError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false)
  })

  it('does not match when the message is missing or non-string', () => {
    expect(isQuotaExceededError(null)).toBe(false)
    expect(isQuotaExceededError(undefined)).toBe(false)
    expect(isQuotaExceededError({})).toBe(false)
    expect(isQuotaExceededError({ message: null })).toBe(false)
  })
})

describe('quotaErrorMessage', () => {
  it('uses the per-resource label', () => {
    expect(quotaErrorMessage('properties')).toContain('properties')
    expect(quotaErrorMessage('documents')).toContain('documents')
    expect(quotaErrorMessage('ocr-runs')).toContain('OCR runs this month')
  })

  it('always points the user at the billing settings page', () => {
    expect(quotaErrorMessage('properties')).toContain('Settings → Billing')
  })
})
