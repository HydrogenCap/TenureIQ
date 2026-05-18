// lib/reports/compliance-status/types.ts

export type ComplianceStatusKind = 'valid' | 'expiring' | 'expired' | 'missing' | 'exempt'

export type ComplianceRow = {
  id: string
  kind: string
  status: ComplianceStatusKind
  issueDate: string | null
  expiryDate: string | null
  issuer: string | null
  notes: string | null
  exemptReason: string | null
}

export type PropertyGroup = {
  propertyId: string
  addressLine1: string
  postcode: string
  entityName: string
  // Required compliance kinds for this property, computed via
  // lib/domain/compliance.requiredComplianceKinds — used to identify
  // missing items.
  requiredKinds: string[]
  items: ComplianceRow[]
}

export type ComplianceStatusData = {
  organisationName: string
  asOf: Date
  entityFilter: string | null
  groups: PropertyGroup[]
  totals: {
    valid: number
    expiring: number
    expired: number
    missing: number
    exempt: number
  }
}
