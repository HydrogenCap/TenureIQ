// components/use-debounced-callback.ts
// Tiny debounce hook for search-as-you-type filters. Each keystroke was
// previously a router.replace → full server round-trip; debouncing trims
// that to one request per pause.

'use client'

import { useEffect, useMemo, useRef } from 'react'

export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs = 300,
): (...args: A) => void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useMemo(
    () =>
      (...args: A) => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => fnRef.current(...args), delayMs)
      },
    [delayMs],
  )
}
