// lib/domain/compliance.ts

export type ComplianceKind =
  | 'gas_safety'
  | 'eicr'
  | 'epc'
  | 'hmo_licence'
  | 'fire_alarm'
  | 'emergency_lighting'
  | 'pat'
  | 'legionella'
  | 'insurance'
  | 'asbestos'
  | 'fire_risk_assessment'
  | 'other'

export const RECOMMENDED_INTERVAL_MONTHS: Record<ComplianceKind, number> = {
  gas_safety: 12,
  eicr: 60,
  epc: 120,
  hmo_licence: 60,
  fire_alarm: 6,
  emergency_lighting: 12,
  pat: 12,
  legionella: 24,
  insurance: 12,
  asbestos: 120,
  fire_risk_assessment: 12,
  other: 12,
}

export type ComplianceStatus = 'valid' | 'expiring' | 'expired' | 'missing'

export function complianceStatus(
  expiry: string | Date | null,
  today: Date = new Date(),
  expiringWindowDays: number = 60
): ComplianceStatus {
  if (!expiry) return 'missing'
  const expiryDate = expiry instanceof Date ? expiry : new Date(expiry)
  if (expiryDate < today) return 'expired'
  const daysUntil = (expiryDate.getTime() - today.getTime()) / 86_400_000
  if (daysUntil <= expiringWindowDays) return 'expiring'
  return 'valid'
}

export type PropertyKind =
  | 'hmo'
  | 'single_let'
  | 'block'
  | 'commercial'
  | 'development'
  | 'land'

export type HmoLicenceKind = 'none' | 'mandatory' | 'additional' | 'selective'

/**
 * Returns the compliance items that should exist for a given property.
 */
export function requiredComplianceKinds(
  propertyKind: PropertyKind,
  hmoLicenceKind: HmoLicenceKind
): ComplianceKind[] {
  if (propertyKind === 'hmo') {
    const base: ComplianceKind[] = [
      'gas_safety',
      'eicr',
      'epc',
      'fire_risk_assessment',
      'fire_alarm',
      'emergency_lighting',
    ]
    if (hmoLicenceKind === 'mandatory' || hmoLicenceKind === 'additional') {
      base.push('hmo_licence')
    }
    return base
  }
  if (propertyKind === 'single_let') {
    return ['gas_safety', 'eicr', 'epc']
  }
  if (propertyKind === 'block') {
    return ['fire_risk_assessment', 'fire_alarm', 'emergency_lighting']
  }
  if (propertyKind === 'commercial') {
    return ['eicr', 'epc', 'fire_risk_assessment']
  }
  return []
}
