// components/form-field.tsx
import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function FormField({
  label,
  hint,
  error,
  required,
  children,
  fullWidth,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  fullWidth?: boolean
  htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'sm:col-span-2')}>
      <Label htmlFor={htmlFor}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
