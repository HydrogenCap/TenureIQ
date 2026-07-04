'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { useDebouncedCallback } from '@/components/use-debounced-callback'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { TRANSACTION_CATEGORIES } from '@/lib/domain/transactions'

type Option = { id: string; name: string }

export function TransactionFilters({
  bankAccounts,
  properties,
}: {
  bankAccounts: Option[]
  properties: Option[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const update = (key: string, val: string) => {
    const next = new URLSearchParams(params.toString())
    if (val) next.set(key, val)
    else next.delete(key)
    router.replace(`${pathname}?${next.toString()}`)
  }

  // Search-as-you-type fires per keystroke; debounce to one navigation
  // per pause instead of a server round-trip per character.
  const updateSearch = useDebouncedCallback((val: string) => update('q', val), 300)

  const reset = () => router.replace(pathname)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search description"
        defaultValue={params.get('q') ?? ''}
        onChange={(e) => updateSearch(e.target.value)}
        className="max-w-xs"
      />
      <Select
        defaultValue={params.get('bankAccount') ?? ''}
        onChange={(e) => update('bankAccount', e.target.value)}
        className="max-w-[200px]"
      >
        <option value="">All accounts</option>
        {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
      <Select
        defaultValue={params.get('property') ?? ''}
        onChange={(e) => update('property', e.target.value)}
        className="max-w-[200px]"
      >
        <option value="">All properties</option>
        {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Select
        defaultValue={params.get('category') ?? ''}
        onChange={(e) => update('category', e.target.value)}
        className="max-w-[200px]"
      >
        <option value="">All categories</option>
        {TRANSACTION_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
      </Select>
      <Input
        type="date"
        defaultValue={params.get('from') ?? ''}
        onChange={(e) => update('from', e.target.value)}
        className="max-w-[150px]"
      />
      <Input
        type="date"
        defaultValue={params.get('to') ?? ''}
        onChange={(e) => update('to', e.target.value)}
        className="max-w-[150px]"
      />
      {params.toString() && (
        <Button variant="ghost" size="sm" onClick={reset}>
          Clear
        </Button>
      )}
    </div>
  )
}
