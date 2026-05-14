// app/(app)/properties/import/_components/preview-table.tsx
'use client'

import { AlertCircle } from 'lucide-react'
import type { ValidationResult } from '@/lib/csv/validate'
import type { PropertyCreate } from '@/lib/schemas/property'
import { formatGbp } from '@/lib/money'

type DisplayRow = {
  rowIndex: number
  address: string
  postcode: string
  kind: string
  price: string
  errors: Array<{ field: string; message: string }>
  invalid: boolean
}

function rowFromValid(p: PropertyCreate, rowIndex: number): DisplayRow {
  return {
    rowIndex,
    address: p.addressLine1,
    postcode: p.postcode,
    kind: p.kind,
    price: formatGbp(p.purchasePricePence),
    errors: [],
    invalid: false,
  }
}

function rowFromInvalid(
  rowIndex: number,
  raw: Record<string, string>,
  errors: Array<{ field: string; message: string }>,
): DisplayRow {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== '') return raw[k] ?? ''
    }
    return ''
  }
  return {
    rowIndex,
    address: get('Address line 1', 'address_line_1', 'address'),
    postcode: get('Postcode', 'postcode'),
    kind: get('Kind', 'kind'),
    price: get('Purchase price', 'purchase_price', 'price'),
    errors,
    invalid: true,
  }
}

export function PreviewTable({
  validation,
}: {
  validation: ValidationResult<PropertyCreate>
}) {
  const display: DisplayRow[] = [
    ...validation.invalid.map((i) =>
      rowFromInvalid(
        i.rowIndex,
        i.raw,
        i.errors.map((e) => ({ field: e.field, message: e.message })),
      ),
    ),
    ...validation.valid
      .slice(0, 20)
      .map((v, i) => rowFromValid(v, validation.invalid.length + i)),
  ]

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Row</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Address</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Postcode</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Kind</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Price</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Errors</th>
            </tr>
          </thead>
          <tbody>
            {display.map((row) => (
              <tr key={row.rowIndex} className={row.invalid ? 'bg-destructive/5' : ''}>
                <td className="px-3 py-2 text-muted-foreground">{row.rowIndex + 2}</td>
                <td className="px-3 py-2">{row.address}</td>
                <td className="px-3 py-2">{row.postcode}</td>
                <td className="px-3 py-2">{row.kind}</td>
                <td className="px-3 py-2">{row.price}</td>
                <td className="px-3 py-2">
                  {row.errors.length > 0 && (
                    <ul className="space-y-0.5">
                      {row.errors.map((e, i) => (
                        <li key={i} className="flex items-start gap-1 text-xs text-destructive">
                          <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                          <span>
                            <strong>{e.field}:</strong> {e.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {validation.valid.length > 20 && (
        <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Showing first 20 of {validation.valid.length} valid rows.
        </div>
      )}
    </div>
  )
}
