// app/(app)/properties/_components/property-filters.tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { useDebouncedCallback } from '@/components/use-debounced-callback'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { PROPERTY_KINDS } from '@/lib/schemas/property'

type EntityOption = { id: string; name: string }

export function PropertyFilters({ entities }: { entities: EntityOption[] }) {
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
        placeholder="Search address or postcode"
        defaultValue={params.get('q') ?? ''}
        onChange={(e) => updateSearch(e.target.value)}
        className="max-w-xs"
      />
      <Select
        defaultValue={params.get('entity') ?? ''}
        onChange={(e) => update('entity', e.target.value)}
        className="max-w-xs"
      >
        <option value="">All entities</option>
        {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </Select>
      <Select
        defaultValue={params.get('kind') ?? ''}
        onChange={(e) => update('kind', e.target.value)}
        className="max-w-[180px]"
      >
        <option value="">All kinds</option>
        {PROPERTY_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
      </Select>
      {params.toString() && (
        <Button variant="ghost" size="sm" onClick={reset}>
          Clear
        </Button>
      )}
    </div>
  )
}
