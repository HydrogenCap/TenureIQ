'use client'

// Refinance what-if calculator. Pure client-side arithmetic — the domain
// functions are pure, so importing them into the client bundle is fine and
// keeps the inputs live (no server round-trip per keystroke). Bigint props
// cross the RSC boundary as strings and are re-hydrated with BigInt().

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormField } from '@/components/form-field'
import { KpiTile } from '@/components/kpi-tile'
import {
  bpsFromPercentPreprocessor,
  bpsToPercent,
  formatGbpPrecise,
  pencePreprocessor,
} from '@/lib/money'
import {
  refinanceScenario,
  ICR_THRESHOLD_BPS,
  type RefinanceScenarioResult,
} from '@/lib/domain/refinance'

type Props = {
  currentBalancePence: string
  currentRateBps: number
  currentMonthlyPaymentPence: string
  currentIsInterestOnly: boolean
  monthlyRentPence: string
}

// Reuse the shared string→bps / string→pence parsers (they dodge the
// IEEE-754 float-multiply drift) but narrow their `unknown` return.
function parsePercentInput(v: string): number | null {
  const out = bpsFromPercentPreprocessor(v)
  return typeof out === 'number' && Number.isInteger(out) && out >= 0 ? out : null
}

function parseGbpInput(v: string): bigint | null {
  if (v.trim() === '') return 0n // blank fee/ERC means zero, not invalid
  const out = pencePreprocessor(v)
  return typeof out === 'bigint' && out >= 0n ? out : null
}

function IcrBadge({ passes }: { passes: boolean }) {
  return <Badge variant={passes ? 'success' : 'destructive'}>{passes ? 'Pass' : 'Fail'}</Badge>
}

function formatIcrBps(bps: number | null): string {
  return bps === null ? '—' : `${(bps / 100).toFixed(0)}%`
}

export function RefinanceCalculator({
  currentBalancePence,
  currentRateBps,
  currentMonthlyPaymentPence,
  currentIsInterestOnly,
  monthlyRentPence,
}: Props) {
  const [ratePct, setRatePct] = useState((currentRateBps / 100).toFixed(2))
  const [termYears, setTermYears] = useState('25')
  const [interestOnly, setInterestOnly] = useState(currentIsInterestOnly)
  const [feeGbp, setFeeGbp] = useState('0')
  const [addFeeToLoan, setAddFeeToLoan] = useState(false)
  const [ercGbp, setErcGbp] = useState('0')

  const candidateRateBps = parsePercentInput(ratePct)
  const termYearsNum = /^\d{1,2}$/.test(termYears.trim()) ? parseInt(termYears, 10) : null
  const candidateTermMonths = termYearsNum !== null && termYearsNum >= 1 ? termYearsNum * 12 : null
  const arrangementFeePence = parseGbpInput(feeGbp)
  const ercPence = parseGbpInput(ercGbp)

  const scenario: RefinanceScenarioResult | null = useMemo(() => {
    if (
      candidateRateBps === null ||
      candidateTermMonths === null ||
      arrangementFeePence === null ||
      ercPence === null
    ) {
      return null
    }
    return refinanceScenario({
      currentBalancePence: BigInt(currentBalancePence),
      currentRateBps,
      currentMonthlyPaymentPence: BigInt(currentMonthlyPaymentPence),
      currentIsInterestOnly,
      candidateRateBps,
      candidateTermMonths,
      candidateIsInterestOnly: interestOnly,
      arrangementFeePence,
      addFeeToLoan,
      ercPence,
      monthlyRentPence: BigInt(monthlyRentPence),
    })
  }, [
    candidateRateBps,
    candidateTermMonths,
    arrangementFeePence,
    ercPence,
    interestOnly,
    addFeeToLoan,
    currentBalancePence,
    currentRateBps,
    currentMonthlyPaymentPence,
    currentIsInterestOnly,
    monthlyRentPence,
  ])

  const rentRoll = BigInt(monthlyRentPence)
  const saving = scenario !== null && scenario.monthlyDeltaPence < 0n

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField
          label="Candidate rate (%)"
          error={candidateRateBps === null ? 'Enter a rate like 4.50' : undefined}
          htmlFor="rf-rate"
        >
          <Input
            id="rf-rate"
            inputMode="decimal"
            value={ratePct}
            onChange={(e) => setRatePct(e.target.value)}
          />
        </FormField>
        <FormField
          label="Term (years)"
          hint={interestOnly ? 'Ignored for interest-only' : undefined}
          error={candidateTermMonths === null ? 'Whole years, 1–99' : undefined}
          htmlFor="rf-term"
        >
          <Input
            id="rf-term"
            inputMode="numeric"
            value={termYears}
            onChange={(e) => setTermYears(e.target.value)}
          />
        </FormField>
        <div className="flex items-end gap-2 pb-2.5">
          <Checkbox
            id="rf-io"
            checked={interestOnly}
            onChange={(e) => setInterestOnly(e.target.checked)}
          />
          <Label htmlFor="rf-io">Interest only</Label>
        </div>
        <FormField
          label="Arrangement fee (£)"
          error={arrangementFeePence === null ? 'Enter a non-negative amount' : undefined}
          htmlFor="rf-fee"
        >
          <Input
            id="rf-fee"
            inputMode="decimal"
            value={feeGbp}
            onChange={(e) => setFeeGbp(e.target.value)}
          />
        </FormField>
        <FormField
          label="Early repayment charge (£)"
          error={ercPence === null ? 'Enter a non-negative amount' : undefined}
          htmlFor="rf-erc"
        >
          <Input
            id="rf-erc"
            inputMode="decimal"
            value={ercGbp}
            onChange={(e) => setErcGbp(e.target.value)}
          />
        </FormField>
        <div className="flex items-end gap-2 pb-2.5">
          <Checkbox
            id="rf-fee-loan"
            checked={addFeeToLoan}
            onChange={(e) => setAddFeeToLoan(e.target.checked)}
          />
          <Label htmlFor="rf-fee-loan">Add fee to loan</Label>
        </div>
      </div>

      {scenario !== null && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiTile
            label="New payment / mo"
            display={formatGbpPrecise(scenario.newMonthlyPaymentPence)}
            sub={<>on {formatGbpPrecise(scenario.newLoanPence)} loan</>}
          />
          <KpiTile
            label="Monthly change"
            display={
              <span className={saving ? 'text-green-600' : scenario.monthlyDeltaPence > 0n ? 'text-red-600' : undefined}>
                {scenario.monthlyDeltaPence > 0n ? '+' : ''}
                {formatGbpPrecise(scenario.monthlyDeltaPence)}
              </span>
            }
            sub={saving ? 'saving' : scenario.monthlyDeltaPence > 0n ? 'higher' : 'no change'}
            trend={saving ? 'up' : scenario.monthlyDeltaPence > 0n ? 'down' : 'flat'}
          />
          <KpiTile
            label="ICR (pay rate)"
            display={
              <span className="flex items-center gap-2">
                {formatIcrBps(scenario.icrBps)} <IcrBadge passes={scenario.icrPasses} />
              </span>
            }
            sub={<>threshold {bpsToPercent(ICR_THRESHOLD_BPS)}</>}
          />
          <KpiTile
            label={`ICR (stressed ${bpsToPercent(scenario.stressBps)})`}
            display={
              <span className="flex items-center gap-2">
                {formatIcrBps(scenario.stressedIcrBps)}{' '}
                <IcrBadge passes={scenario.stressedIcrPasses} />
              </span>
            }
            sub={rentRoll === 0n ? 'no rent roll recorded' : undefined}
          />
          <KpiTile
            label="Break even"
            display={
              scenario.breakEvenMonths === null
                ? '—'
                : scenario.breakEvenMonths === 0
                  ? 'Immediate'
                  : `${scenario.breakEvenMonths} mo`
            }
            sub={
              scenario.breakEvenMonths === null
                ? 'no monthly saving'
                : 'to recoup upfront costs'
            }
          />
        </div>
      )}
    </div>
  )
}
