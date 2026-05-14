// lib/csv/parse.ts
// Papaparse wrapper used by every CSV import wizard (properties, transactions, etc).

import Papa from 'papaparse'

export type ParsedRow = Record<string, string>

export type ParseResult = {
  headers: string[]
  rows: ParsedRow[]
  errors: Papa.ParseError[]
}

export async function parseCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data,
          errors: results.errors,
        })
      },
      error: reject,
    })
  })
}
