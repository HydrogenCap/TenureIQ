// components/notification-bell.tsx
// Header bell + dropdown for the in-app notification centre. Data comes from
// the listNotifications server action (RLS/org-scoped), so this stays a thin
// client. No portal/popover deps — the panel is absolutely positioned off the
// bell, matching the hand-rolled approach of command-palette.tsx.
//
// Per-user "seen" state is deliberately client-side: reminders has no
// per-user read receipts (no schema changes allowed), so the last-opened
// ISO timestamp lives in localStorage. Cross-device read-sync is explicitly
// out of scope — opening the bell on one device does not clear the badge on
// another.
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { listNotifications } from '@/app/(app)/notifications-actions'
import { relativeTime, type NotificationItem } from '@/lib/domain/notifications'

const REFETCH_INTERVAL_MS = 5 * 60 * 1000 // at most one refetch per 5 minutes

// Key includes the organisation so switching orgs keeps separate cursors.
function storageKey(organisationId: string): string {
  return `tenureiq:notifications:last-seen:${organisationId}`
}

function readLastSeenMs(organisationId: string): number {
  try {
    const raw = window.localStorage.getItem(storageKey(organisationId))
    if (!raw) return 0
    const parsed = Date.parse(raw)
    return Number.isNaN(parsed) ? 0 : parsed
  } catch {
    // localStorage can throw (private mode, disabled storage) — treat as
    // "never opened" rather than breaking the header.
    return 0
  }
}

export function NotificationBell({ organisationId }: { organisationId: string }) {
  const router = useRouter()
  const containerRef = React.useRef<HTMLDivElement>(null)

  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<NotificationItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [lastSeenMs, setLastSeenMs] = React.useState(0)
  // Snapshot of "now" advanced on each fetch, so the unread count is stable
  // between renders instead of drifting with every re-render.
  const [nowMs, setNowMs] = React.useState(0)
  const [, startTransition] = React.useTransition()

  const refetch = React.useCallback(() => {
    startTransition(async () => {
      const res = await listNotifications()
      if (res.ok) {
        setItems(res.data)
        setError(null)
      } else {
        setError(res.error)
      }
      setNowMs(Date.now())
    })
  }, [])

  React.useEffect(() => {
    setLastSeenMs(readLastSeenMs(organisationId))
    refetch()
    // The header lives for the whole session, so poll while mounted; the
    // interval is cleared on unmount (and on org switch via the dep).
    const timer = window.setInterval(refetch, REFETCH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [organisationId, refetch])

  // Close on outside click / Escape while the panel is up.
  React.useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const container = containerRef.current
      if (container && e.target instanceof Node && !container.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Unread = triggered since last open, but not future-dated: a pending
  // reminder firing next week would otherwise badge forever, because
  // opening the panel only moves last-seen up to "now".
  const unread = items.filter((item) => {
    const t = Date.parse(item.triggerAt)
    return !Number.isNaN(t) && t > lastSeenMs && t <= nowMs
  }).length
  const badge = unread > 9 ? '9+' : String(unread)

  const markSeen = () => {
    const now = Date.now()
    setLastSeenMs(now)
    try {
      window.localStorage.setItem(storageKey(organisationId), new Date(now).toISOString())
    } catch {
      // Storage unavailable: badge still clears for this page lifetime.
    }
  }

  const toggle = () => {
    // Opening counts as "seen" — the badge clears even if the user closes
    // the panel without clicking anything.
    if (!open) markSeen()
    setOpen(!open)
  }

  const navigateTo = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          /* Count is decorative here — the accessible name on the button
             already announces it. */
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground"
          >
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-3 py-2 text-sm font-medium">
            Notifications
          </div>
          <div className="max-h-96 overflow-y-auto p-1">
            {error !== null ? (
              <p className="px-3 py-4 text-sm text-destructive">{error}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No notifications</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => navigateTo(item.href)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{item.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(item.triggerAt)}
                    </span>
                  </span>
                  {item.detail ? (
                    <span className="w-full truncate text-xs text-muted-foreground">
                      {item.detail}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
