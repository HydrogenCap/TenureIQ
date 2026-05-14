# Section 24 — Tenant Tax (Mortgage Interest Restriction)

Read when implementing entity P&L or any comparison of individual vs corporate landlord economics.

## The rule

Since 6 April 2017 (fully phased in by 6 April 2020), individual UK landlords cannot deduct **mortgage and finance costs** from rental income when computing taxable rental profit. Instead, they receive a **basic-rate (20%) tax credit** on those costs.

This affects:
- Mortgage interest (residential BTL)
- Bridging finance interest
- Mortgage product fees and broker fees (where attributable to financing)
- Overdraft interest where the overdraft funds the rental business

It does **not** affect:
- Limited company landlords (deduct interest fully as a business expense)
- LLP landlords where the partners are corporate (depends on partnership tax rules — get accountant advice)
- Other deductible costs (repairs, agent fees, insurance, ground rent) — these remain fully deductible

## Practical impact on tax

| Borrower | Pre-S24 (notional) | Post-S24 |
|---|---|---|
| Individual basic-rate | Same tax | Same tax (20% deduction = 20% credit) |
| Individual higher-rate | Lower tax | **Materially higher tax** |
| Individual additional-rate | Lower tax | **Materially higher tax** |
| Limited company | Same tax | Same tax (unaffected) |

The higher-rate landlord is the worst hit. A landlord who was previously a basic-rate taxpayer can also be **pushed into higher-rate** because the gross rental income (before interest deduction) is added to other income to determine the band.

## Worked example

Property: £20,000 gross rent, £8,000 mortgage interest, £3,000 other costs. Landlord has £45,000 other income.

### Pre-S24 calculation (no longer applies)
- Taxable rental profit: £20,000 - £8,000 - £3,000 = £9,000
- Added to other income: £45,000 + £9,000 = £54,000
- Tax on £9,000 at higher rate (40%) = £3,600

### Post-S24 calculation (current law)
- Taxable rental profit: £20,000 - £3,000 = £17,000 *(interest NOT deducted)*
- Added to other income: £45,000 + £17,000 = £62,000
- Tax on £17,000: portion at basic, portion at higher. Assuming basic-rate band fills first: most of the £17,000 falls into higher-rate. Approximate tax before credit ≈ £6,300.
- Interest credit: 20% × £8,000 = £1,600
- **Net tax ≈ £4,700**

Post-S24 cost is **£1,100 higher per year** on this single property compared to pre-S24. Scaled across a portfolio, this is the magnitude that drives incorporation decisions.

## TenureIQ implementation

The entity P&L must:

1. Track interest and finance costs separately from other deductible costs.
2. For entities of `kind='individual'`, compute Section 24 net tax via the credit method.
3. For entities of `kind='ltd' | 'llp' | 'spv'`, deduct interest normally and apply CT rate.
4. Surface "Section 24 cost" as an explicit line item in P&L: the difference between pre-S24 and post-S24 tax for that owner. This makes the incorporation case visible.

```ts
// lib/domain/section24.ts
export function section24Cost(input: {
  grossRentPence: bigint
  mortgageInterestPence: bigint
  otherCostsPence: bigint
  marginalRateBps: number  // 4000 = higher, 4500 = additional
}): bigint {
  if (input.marginalRateBps <= 2000) return 0n  // basic rate: no impact

  // Pre-S24 tax (hypothetical)
  const preS24Profit = input.grossRentPence - input.mortgageInterestPence - input.otherCostsPence
  const preS24Tax = preS24Profit > 0n ? (preS24Profit * BigInt(input.marginalRateBps)) / 10000n : 0n

  // Post-S24 tax (real)
  const postS24Profit = input.grossRentPence - input.otherCostsPence
  const taxBefore = (postS24Profit * BigInt(input.marginalRateBps)) / 10000n
  const credit = (input.mortgageInterestPence * 2000n) / 10000n
  const postS24Tax = taxBefore > credit ? taxBefore - credit : 0n

  return postS24Tax - preS24Tax
}
```

## Surfacing in UI

On entity detail (individual-owned):
- "Section 24 cost this year: £X,XXX" with a tooltip explaining the calculation.
- "Estimated saving if held in a Ltd company: £X,XXX/year" — but caveat that incorporation has costs (CGT on transfer, SDLT on transfer to connected company, ongoing accountancy).

Do not recommend incorporation in the UI. Surface the numbers, link to "Speak to your accountant", and stop. TenureIQ is not tax advice software.

## Anti-patterns

1. Treating individuals and companies with the same P&L logic.
2. Forgetting that adding gross rent (not net profit) to other income can push a basic-rate taxpayer into higher rate.
3. Auto-recommending incorporation — out of scope and risky advice without full personal context.
