import { describe, it, expect } from 'vitest'
import {
  maxLoanByLtvPence,
  maxLoanByIcrPence,
  refinanceHeadroom,
} from './refinance'

describe('maxLoanByLtvPence', () => {
  it('75% LTV of £200k = £150k', () => {
    expect(maxLoanByLtvPence(200_000_00n, 7500)).toBe(150_000_00n)
  })

  it('100% LTV passes through', () => {
    expect(maxLoanByLtvPence(200_000_00n, 10_000)).toBe(200_000_00n)
  })

  it('0 LTV returns 0', () => {
    expect(maxLoanByLtvPence(200_000_00n, 0)).toBe(0n)
  })
})

describe('maxLoanByIcrPence', () => {
  it('returns 0 when stressBps is 0 (avoids divide by zero)', () => {
    expect(maxLoanByIcrPence(1_000_00n, 0, 14500)).toBe(0n)
  })

  it('returns 0 when thresholdBps is 0', () => {
    expect(maxLoanByIcrPence(1_000_00n, 525, 0)).toBe(0n)
  })

  it('£1,000/month rent at 5.5% stress and 145% threshold ≈ £150k balance', () => {
    // monthlyRent / threshold = max stressed monthly interest payment
    // maxStressed = 1000 / 1.45 ≈ 689.66
    // 689.66 = balance * 0.055 / 12 → balance ≈ 689.66 * 12 / 0.055 ≈ 150,471
    const r = maxLoanByIcrPence(1_000_00n, 550, 14_500)
    // Integer-truncating arithmetic; allow tolerance.
    const expectedPounds = Number(r) / 100
    expect(expectedPounds).toBeGreaterThan(150_000)
    expect(expectedPounds).toBeLessThan(151_000)
  })
})

describe('refinanceHeadroom', () => {
  it('reports LTV-binding when LTV is the smaller cap', () => {
    // Tiny valuation, generous ICR → LTV binds.
    const r = refinanceHeadroom({
      valuationPence: 100_000_00n,
      currentBalancePence: 50_000_00n,
      monthlyRentPence: 5_000_00n,
      maxLtvBps: 7500,
      stressBps: 550,
      thresholdBps: 14_500,
    })
    expect(r.bindingConstraint).toBe('ltv')
    expect(r.maxLoanPence).toBe(75_000_00n)
    expect(r.headroomPence).toBe(25_000_00n)
  })

  it('reports ICR-binding when rent roll is the smaller cap', () => {
    // Huge LTV cap but thin rent → ICR binds.
    const r = refinanceHeadroom({
      valuationPence: 1_000_000_00n,
      currentBalancePence: 100_000_00n,
      monthlyRentPence: 500_00n, // £500/mo
      maxLtvBps: 7500,
      stressBps: 550,
      thresholdBps: 14_500,
    })
    expect(r.bindingConstraint).toBe('icr')
    expect(r.maxLoanPence).toBe(r.maxLoanByIcrPence)
    expect(r.headroomPence).toBe(r.maxLoanByIcrPence - 100_000_00n)
  })

  it('can return a negative headroom (overborrowed)', () => {
    const r = refinanceHeadroom({
      valuationPence: 100_000_00n,
      currentBalancePence: 90_000_00n, // higher than 75% LTV cap
      monthlyRentPence: 5_000_00n,
      maxLtvBps: 7500,
      stressBps: 550,
      thresholdBps: 14_500,
    })
    expect(r.headroomPence).toBe(-15_000_00n)
  })
})
