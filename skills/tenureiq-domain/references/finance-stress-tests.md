# BTL Finance Stress Tests, ICR, Stressed LTV, Section 24

Read when implementing `lib/domain/icr.ts`, `lib/domain/section24.ts`, or any refinance/affordability surface.

## ICR — Interest Coverage Ratio

The BTL lender's affordability test. Formula:

```
ICR = (monthly rent) / (monthly interest at stress rate)
```

Stress rates and thresholds vary by lender, borrower type, and product. PRA-prescribed minimums (post-2017):

| Borrower | Threshold | Typical stress rate |
|---|---|---|
| Basic-rate individual | ≥125% | 5.5% or pay rate + 2%, whichever higher |
| Higher-rate individual | ≥145% | 5.5% or pay rate + 2% |
| Limited company | ≥125% | Lender-set, often 5.5% |
| 5-year+ fixed | ≥125% across the board | Pay rate (no stress uplift) |

**Critical rule**: For 5-year-or-longer fixed-rate products, lenders are permitted to use the pay rate rather than a stressed rate. This typically unlocks materially larger loans. Encode this.

## Implementation

```ts
// lib/domain/icr.ts
type IcrInput = {
  monthlyRentPence: bigint
  balancePence: bigint
  payRateBps: number
  productYears: number  // term until next refinance / end of fix
  borrowerKind: 'individual_basic' | 'individual_higher' | 'company'
}

export function effectiveStressBps(input: IcrInput): number {
  // 5+ year fix: use pay rate, no uplift
  if (input.productYears >= 5) return input.payRateBps
  // Otherwise: max(pay + 200bps, 550bps)
  return Math.max(input.payRateBps + 200, 550)
}

export function icr(input: IcrInput): {
  stressBps: number
  monthlyInterestStressed: bigint
  ratio: number
  threshold: number
  passes: boolean
} {
  const stressBps = effectiveStressBps(input)
  // monthly interest = balance * rate / 12
  const monthlyInterestStressed = (input.balancePence * BigInt(stressBps)) / 10000n / 12n
  const ratio = Number(input.monthlyRentPence) / Number(monthlyInterestStressed)
  const threshold = input.borrowerKind === 'individual_higher' ? 1.45 : 1.25
  return { stressBps, monthlyInterestStressed, ratio, threshold, passes: ratio >= threshold }
}
```

## Stressed LTV — refinance headroom

A property's maximum loanable amount depends on both LTV cap and ICR. The binding constraint is usually ICR for high-yielding HMOs in low-value areas, and LTV for low-yielding stock in high-value areas.

```ts
// lib/domain/refinance.ts
export function maxLoanByLtv(valuationPence: bigint, maxLtvBps: number): bigint {
  return (valuationPence * BigInt(maxLtvBps)) / 10000n
}

export function maxLoanByIcr(monthlyRentPence: bigint, stressBps: number, thresholdBps: number): bigint {
  // monthly rent / (1.25 or 1.45) = max stressed monthly interest
  // max balance = max stressed monthly interest * 12 / stressRate
  const maxStressedMonthlyInterest = (monthlyRentPence * 10000n) / BigInt(thresholdBps)
  return (maxStressedMonthlyInterest * 12n * 10000n) / BigInt(stressBps)
}

export function refinanceHeadroom(input: {
  valuationPence: bigint
  currentBalancePence: bigint
  monthlyRentPence: bigint
  maxLtvBps: number
  stressBps: number
  thresholdBps: number
}): {
  maxLoanPence: bigint
  headroomPence: bigint  // can be negative if over-leveraged
  bindingConstraint: 'ltv' | 'icr'
} {
  const byLtv = maxLoanByLtv(input.valuationPence, input.maxLtvBps)
  const byIcr = maxLoanByIcr(input.monthlyRentPence, input.stressBps, input.thresholdBps)
  const maxLoanPence = byLtv < byIcr ? byLtv : byIcr
  return {
    maxLoanPence,
    headroomPence: maxLoanPence - input.currentBalancePence,
    bindingConstraint: byLtv < byIcr ? 'ltv' : 'icr',
  }
}
```

## Section 24 — interest deductibility for individuals

Since April 2020 (phased from 2017), individual landlords cannot deduct mortgage interest from rental income for tax purposes. They receive a 20% tax credit on the interest instead.

**Result**: An individual landlord on the 40% higher rate pays the same tax on a £10,000 rent whether they paid £5,000 or £10,000 of mortgage interest. The full mortgage cost still hits cashflow but does not reduce taxable income beyond the 20% credit.

This is the single biggest reason HMO investors incorporate. The arithmetic:

```ts
// lib/domain/section24.ts
type S24Input = {
  grossRentPence: bigint
  mortgageInterestPence: bigint
  otherCostsPence: bigint  // repairs, agents, insurance, etc — fully deductible
  marginalRateBps: number  // 2000 basic, 4000 higher, 4500 additional
}

export function individualLandlordTax(input: S24Input): {
  taxableProfit: bigint
  taxBeforeCredit: bigint
  interestCredit: bigint  // = mortgageInterest * 20%
  netTax: bigint
  effectiveRateOnRent: number  // netTax / grossRent
} {
  const taxableProfit = input.grossRentPence - input.otherCostsPence  // interest NOT deducted
  const taxBeforeCredit = (taxableProfit * BigInt(input.marginalRateBps)) / 10000n
  const interestCredit = (input.mortgageInterestPence * 2000n) / 10000n  // 20% credit
  const netTax = taxBeforeCredit - interestCredit
  return {
    taxableProfit,
    taxBeforeCredit,
    interestCredit,
    netTax: netTax < 0n ? 0n : netTax,
    effectiveRateOnRent: Number(netTax) / Number(input.grossRentPence),
  }
}

export function companyLandlordTax(input: {
  grossRentPence: bigint
  mortgageInterestPence: bigint
  otherCostsPence: bigint
  ctRateBps: number  // 1900 small profits, 2500 main
}): {
  taxableProfit: bigint
  netTax: bigint
} {
  // Interest is fully deductible as a business expense
  const taxableProfit = input.grossRentPence - input.mortgageInterestPence - input.otherCostsPence
  const netTax = taxableProfit > 0n ? (taxableProfit * BigInt(input.ctRateBps)) / 10000n : 0n
  return { taxableProfit, netTax }
}
```

## Worked comparison surface

For a property generating £20,000 gross rent, £8,000 mortgage interest, £3,000 other costs:

- Individual (higher-rate 40%): taxable profit £17,000, tax before credit £6,800, interest credit £1,600, **net tax £5,200**.
- Limited company (25% CT): taxable profit £9,000, **net tax £2,250**.

Saving by holding in company: £2,950 per property per year. TenureIQ should surface this calculation per-property on the Entity P&L view.

## Anti-patterns

1. Computing individual landlord tax by deducting mortgage interest from gross rent (this is the pre-2017 method).
2. Applying the interest credit to non-mortgage interest (it applies only to the financing of the rental property).
3. Using float arithmetic on bigint pence — always integer math with explicit conversion.
4. Hardcoding tax rates in source — read from a `tax_config` table or env-backed config so April rate changes are a config update, not a code release.
