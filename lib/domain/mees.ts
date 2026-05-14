// lib/domain/mees.ts
// Minimum Energy Efficiency Standards.

export type EpcBand = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

const BAND_ORDER: EpcBand[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

export function isLetBlocked(band: EpcBand, minimum: EpcBand = 'E'): boolean {
  return BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(minimum)
}

export type MeesStatus = 'compliant' | 'let_blocked' | 'epc_expired' | 'epc_missing'

export function meesStatus(
  band: EpcBand | null,
  expiryDate: string | Date | null,
  minimum: EpcBand = 'E',
  today: Date = new Date()
): MeesStatus {
  if (!band || !expiryDate) return 'epc_missing'
  const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate)
  if (expiry < today) return 'epc_expired'
  if (isLetBlocked(band, minimum)) return 'let_blocked'
  return 'compliant'
}
