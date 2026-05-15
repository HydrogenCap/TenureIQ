import { describe, it, expect } from 'vitest'
import { monthlyRentPence, annualRentPence, weeklyRentPence } from './rent'

describe('monthlyRentPence', () => {
  it('passes through monthly', () => {
    expect(monthlyRentPence(120_000n, 'monthly')).toBe(120_000n)
  })
  it('converts weekly to monthly via × 52 / 12', () => {
    // £150/week = £150 × 52 ÷ 12 = £650/month
    expect(monthlyRentPence(15_000n, 'weekly')).toBe(65_000n)
  })
  it('converts four-weekly to monthly', () => {
    // £600/4w = £600 × 13 ÷ 12 = £650/month
    expect(monthlyRentPence(60_000n, 'four_weekly')).toBe(65_000n)
  })
  it('converts annual to monthly via ÷ 12', () => {
    expect(monthlyRentPence(120_000_00n, 'annual')).toBe(1_000_000n)
  })
  it('does not equal weekly × 4 (the common arithmetic mistake)', () => {
    // £100/wk × 4 would give £400, but the correct monthly is £100 × 52/12 = £433.33
    const correct = monthlyRentPence(10_000n, 'weekly')
    const wrong = 10_000n * 4n
    expect(correct).not.toBe(wrong)
    expect(correct).toBe(43_333n) // £433.33
  })
})

describe('annualRentPence', () => {
  it('passes through annual', () => {
    expect(annualRentPence(1_000_000n, 'annual')).toBe(1_000_000n)
  })
  it('weekly × 52', () => {
    expect(annualRentPence(10_000n, 'weekly')).toBe(520_000n)
  })
  it('monthly × 12', () => {
    expect(annualRentPence(120_000n, 'monthly')).toBe(1_440_000n)
  })
  it('four-weekly × 13', () => {
    expect(annualRentPence(60_000n, 'four_weekly')).toBe(780_000n)
  })
})

describe('weeklyRentPence', () => {
  it('passes through weekly', () => {
    expect(weeklyRentPence(15_000n, 'weekly')).toBe(15_000n)
  })
  it('annual / 52', () => {
    expect(weeklyRentPence(520_000n, 'annual')).toBe(10_000n)
  })
  it('monthly × 12 / 52', () => {
    // £650/mo = £650 × 12 ÷ 52 = £150/wk
    expect(weeklyRentPence(65_000n, 'monthly')).toBe(15_000n)
  })
})
