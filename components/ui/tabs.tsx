// components/ui/tabs.tsx
// Minimal tab navigation. Tabs are URL-driven (?tab=overview) so deep links work.
'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export type TabDef = { tabKey: string; label: string; disabled?: boolean }

export function Tabs({
  tabs,
  defaultTabKey,
  paramName = 'tab',
}: {
  tabs: TabDef[]
  defaultTabKey: string
  paramName?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const active = params.get(paramName) ?? defaultTabKey

  return (
    <div className="border-b">
      <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
        {tabs.map((t) => {
          const isActive = t.tabKey === active
          return (
            <button
              key={t.tabKey}
              type="button"
              disabled={t.disabled}
              onClick={() => {
                const next = new URLSearchParams(params.toString())
                next.set(paramName, t.tabKey)
                router.replace(`${pathname}?${next.toString()}`, { scroll: false })
              }}
              className={cn(
                'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                t.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
