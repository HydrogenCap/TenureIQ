// components/getting-started.tsx
// First-run checklist shown on the dashboard while the organisation's
// core setup is incomplete. Pure presentational server component — the
// dashboard computes step completion from counts it already fetches.

import Link from 'next/link'

export type GettingStartedStep = {
  title: string
  description: string
  href: string
  done: boolean
}

export function GettingStarted({ steps }: { steps: GettingStartedStep[] }) {
  const done = steps.filter((s) => s.done).length

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Getting started</h2>
        <p className="text-sm text-muted-foreground">
          {done} of {steps.length} done
        </p>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step, i) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              aria-hidden
              className={
                step.done
                  ? 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground'
                  : 'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium text-muted-foreground'
              }
            >
              {step.done ? '✓' : i + 1}
            </span>
            <div className="min-w-0">
              {step.done ? (
                <p className="text-sm font-medium text-muted-foreground line-through">
                  {step.title}
                </p>
              ) : (
                <Link href={step.href} className="text-sm font-medium text-primary hover:underline">
                  {step.title}
                </Link>
              )}
              {!step.done && (
                <p className="text-xs text-muted-foreground">{step.description}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
