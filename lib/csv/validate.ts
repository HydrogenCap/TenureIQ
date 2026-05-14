// lib/csv/validate.ts
// Row-level Zod validation for any CSV import. Used by every <Resource>ImportWizard.

import type { SafeParseReturnType } from 'zod'

export type ValidationError = {
  rowIndex: number
  field: string
  message: string
}

export type ValidationResult<T> = {
  valid: T[]
  invalid: Array<{ rowIndex: number; raw: Record<string, string>; errors: ValidationError[] }>
}

// Structural schema typing — we only need `safeParse`. Avoids the Zod
// `ZodSchema<T>` generic, which infers T from the input side when the schema
// uses preprocessing/effects.
type Parseable<T> = {
  safeParse: (input: unknown) => SafeParseReturnType<unknown, T>
}

export function validateRows<T>(
  rows: Record<string, string>[],
  schema: Parseable<T>,
  mapRow: (raw: Record<string, string>) => Record<string, unknown>,
): ValidationResult<T> {
  const valid: T[] = []
  const invalid: ValidationResult<T>['invalid'] = []

  rows.forEach((raw, rowIndex) => {
    const mapped = mapRow(raw)
    const result = schema.safeParse(mapped)
    if (result.success) {
      valid.push(result.data)
    } else {
      invalid.push({
        rowIndex,
        raw,
        errors: result.error.issues.map((issue) => ({
          rowIndex,
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }
  })

  return { valid, invalid }
}
