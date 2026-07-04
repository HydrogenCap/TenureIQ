// components/command-palette.tsx
// Cmd+K global search. Renders its own trigger button plus a hand-rolled
// modal (no Radix/portal deps — the dialog is fixed-position so it can live
// anywhere in the tree). Results come from the globalSearch server action,
// so everything shown is already RLS/org-scoped.
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { globalSearch } from '@/app/(app)/search-actions'
import type { SearchHit, SearchKind, SearchResults } from '@/app/(app)/search-actions'
import { useDebouncedCallback } from '@/components/use-debounced-callback'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const KIND_LABELS: Record<SearchKind, string> = {
  property: 'Properties',
  tenant: 'Tenants',
  entity: 'Entities',
  mortgage: 'Mortgages',
  transaction: 'Transactions',
}

const MIN_QUERY_LENGTH = 2

type FlatHit = SearchHit & { kind: SearchKind }

// Pre-flattened render model: headings interleaved with hits, where each hit
// carries its index in the flat list so arrow-key highlighting is a single
// integer rather than a (group, item) pair.
type RenderRow =
  | { type: 'heading'; key: string; label: string }
  | { type: 'hit'; key: string; index: number; hit: FlatHit }

function buildRows(results: SearchResults | null): { rows: RenderRow[]; flat: FlatHit[] } {
  if (!results) return { rows: [], flat: [] }
  const rows: RenderRow[] = []
  const flat: FlatHit[] = []
  for (const group of results.groups) {
    rows.push({ type: 'heading', key: `h-${group.kind}`, label: KIND_LABELS[group.kind] })
    for (const hit of group.hits) {
      rows.push({ type: 'hit', key: `${group.kind}-${hit.id}`, index: flat.length, hit: { ...hit, kind: group.kind } })
      flat.push({ ...hit, kind: group.kind })
    }
  }
  return { rows, flat }
}

export function CommandPalette() {
  const router = useRouter()
  const baseId = React.useId()
  const listboxId = `${baseId}-listbox`
  const inputRef = React.useRef<HTMLInputElement>(null)
  // Monotonic sequence number so a slow early response can never overwrite
  // the results of a later keystroke.
  const requestSeq = React.useRef(0)

  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResults | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [highlight, setHighlight] = React.useState(0)
  const [isPending, startTransition] = React.useTransition()

  const { rows, flat } = React.useMemo(() => buildRows(results), [results])
  const optionId = React.useCallback((index: number) => `${baseId}-option-${index}`, [baseId])

  const close = React.useCallback(() => setOpen(false), [])

  const navigateTo = React.useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  const runSearch = React.useCallback(
    (q: string) => {
      const seq = ++requestSeq.current
      startTransition(async () => {
        const res = await globalSearch({ q })
        if (seq !== requestSeq.current) return // superseded by a newer keystroke
        if (res.ok) {
          setResults(res.data)
          setError(null)
        } else {
          setResults(null)
          setError(res.error)
        }
        setHighlight(0)
      })
    },
    [startTransition],
  )
  const debouncedSearch = useDebouncedCallback(runSearch, 250)

  const onQueryChange = (value: string) => {
    setQuery(value)
    const trimmed = value.trim()
    if (trimmed.length >= MIN_QUERY_LENGTH) {
      debouncedSearch(trimmed)
    } else {
      // Below the minimum: invalidate any in-flight request and show the hint.
      requestSeq.current += 1
      setResults(null)
      setError(null)
      setHighlight(0)
    }
  }

  // Global shortcut: Cmd+K (macOS) / Ctrl+K toggles; Escape always closes.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Autofocus on open; select any previous query so typing replaces it.
  React.useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [open])

  // Lock body scroll while the dialog is up (modal without a portal lib).
  React.useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Keep the highlighted option visible as arrow keys move it.
  React.useEffect(() => {
    if (!open || flat.length === 0) return
    document.getElementById(optionId(highlight))?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open, flat.length, optionId])

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (flat.length > 0) setHighlight((h) => (h + 1) % flat.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (flat.length > 0) setHighlight((h) => (h - 1 + flat.length) % flat.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flat[highlight]
      if (hit) navigateTo(hit.href)
    }
  }

  const trimmedLength = query.trim().length
  const showHint = trimmedLength < MIN_QUERY_LENGTH
  const showNoMatches = !showHint && !isPending && error === null && results !== null && flat.length === 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>Search</span>
        <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] leading-4">
          &#8984;K
        </kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Global search">
          {/* Backdrop click closes; it is decorative for assistive tech. */}
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={close} />
          <div className="relative mx-auto mt-[10vh] w-full max-w-lg px-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              <div className="border-b border-border p-2">
                <Input
                  ref={inputRef}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={flat.length > 0 ? optionId(highlight) : undefined}
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={onInputKeyDown}
                  placeholder="Search properties, tenants, entities, mortgages, transactions"
                  className="h-9 border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <div
                id={listboxId}
                role="listbox"
                aria-label="Search results"
                className="max-h-80 overflow-y-auto p-2"
              >
                {error !== null ? (
                  <p className="px-2 py-3 text-sm text-destructive">{error}</p>
                ) : showHint ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    Type at least 2 characters
                  </p>
                ) : isPending && results === null ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Searching&hellip;</p>
                ) : showNoMatches ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">No matches</p>
                ) : (
                  rows.map((row) =>
                    row.type === 'heading' ? (
                      <div
                        key={row.key}
                        className="px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {row.label}
                      </div>
                    ) : (
                      <div
                        key={row.key}
                        id={optionId(row.index)}
                        role="option"
                        aria-selected={row.index === highlight}
                        onMouseEnter={() => setHighlight(row.index)}
                        onClick={() => navigateTo(row.hit.href)}
                        className={cn(
                          'flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-2 text-sm',
                          row.index === highlight && 'bg-accent text-accent-foreground',
                        )}
                      >
                        <span className="truncate">{row.hit.label}</span>
                        {row.hit.detail ? (
                          <span className="shrink-0 truncate text-xs text-muted-foreground">
                            {row.hit.detail}
                          </span>
                        ) : null}
                      </div>
                    ),
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
