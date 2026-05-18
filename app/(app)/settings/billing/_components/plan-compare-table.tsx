'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MoneyDisplay } from '@/components/money-display'
import { PLANS, type PlanId } from '@/lib/billing/plans'
import { createCheckoutSession, createPortalSession } from '../actions'

type Props = {
  currentPlan: PlanId
  hasStripeCustomer: boolean
}

const PURCHASABLE: PlanId[] = ['starter', 'growth', 'pro']

function feature(label: string, included: boolean): React.ReactNode {
  return (
    <td className="px-3 py-2 text-center">
      {included ? (
        <span className="text-green-600">✓</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </td>
  )
}

function quotaCell(value: number | null): React.ReactNode {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      {value === null ? '∞' : value.toLocaleString('en-GB')}
    </td>
  )
}

export function PlanCompareTable({ currentPlan, hasStripeCustomer }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const upgrade = (target: PlanId): void => {
    if (!PURCHASABLE.includes(target)) return
    setError(null)
    startTransition(async () => {
      const result = await createCheckoutSession({ targetPlan: target })
      if (!result.ok) {
        setError(result.error)
        return
      }
      window.location.href = result.data.url
    })
  }

  const portal = (): void => {
    setError(null)
    startTransition(async () => {
      const result = await createPortalSession()
      if (!result.ok) {
        setError(result.error)
        return
      }
      window.location.href = result.data.url
    })
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">Plans</h2>
        {hasStripeCustomer && (
          <Button variant="outline" onClick={portal} disabled={pending}>
            Manage billing
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                Plan
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                Properties
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                Documents
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                OCR / mo
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-muted-foreground">
                AASC
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-muted-foreground">
                Reports
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-muted-foreground">
                Investors
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                £ / month
              </th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(PLANS) as PlanId[]).map((id) => {
              const plan = PLANS[id]
              const isCurrent = id === currentPlan
              return (
                <tr key={id} className={isCurrent ? 'bg-muted/30' : ''}>
                  <td className="px-3 py-2 font-medium">
                    {plan.label}
                    {isCurrent && (
                      <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary-foreground">
                        Current
                      </span>
                    )}
                  </td>
                  {quotaCell(plan.maxProperties)}
                  {quotaCell(plan.maxDocuments)}
                  {quotaCell(plan.maxOcrPerMonth)}
                  {feature('aasc', plan.features.aasc)}
                  {feature('reports', plan.features.reports)}
                  {feature('investors', plan.features.investors)}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {plan.monthlyPricePence === null ? (
                      id === 'enterprise' ? (
                        'Contact'
                      ) : (
                        '—'
                      )
                    ) : (
                      <MoneyDisplay pence={plan.monthlyPricePence} />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {PURCHASABLE.includes(id) && !isCurrent && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => upgrade(id)}
                        disabled={pending}
                      >
                        {currentPlan === 'free' || isUpgrade(currentPlan, id)
                          ? 'Upgrade'
                          : 'Switch'}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        All plans on a 14-day Growth trial by default — no card required to
        start. Discounts and annual plans are configured in the Stripe
        Customer Portal.
      </p>
    </section>
  )
}

function isUpgrade(current: PlanId, target: PlanId): boolean {
  const order: PlanId[] = ['free', 'starter', 'growth', 'pro', 'enterprise']
  return order.indexOf(target) > order.indexOf(current)
}
