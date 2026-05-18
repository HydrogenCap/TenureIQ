// lib/reports/compliance-status/fetch.ts

import { supabaseServer } from '@/lib/db/user'
import {
  complianceStatus,
  requiredComplianceKinds,
  type PropertyKind,
  type HmoLicenceKind,
} from '@/lib/domain/compliance'
import type {
  ComplianceRow,
  ComplianceStatusData,
  ComplianceStatusKind,
  PropertyGroup,
} from './types'

type PropertyDbRow = {
  id: string
  address_line_1: string
  postcode: string
  kind: string
  hmo_licence_kind: string | null
  entity: Array<{ name: string }>
}

type ItemDbRow = {
  id: string
  property_id: string
  kind: string
  status: string
  issue_date: string | null
  expiry_date: string | null
  issuer: string | null
  notes: string | null
}

export async function fetchComplianceStatus(
  organisationId: string,
  entityId: string | null,
): Promise<ComplianceStatusData> {
  const sb = await supabaseServer()
  const today = new Date()

  let propsQuery = sb
    .from('properties')
    .select(
      'id, address_line_1, postcode, kind, hmo_licence_kind, entity:entities(name)',
    )
    .eq('organisation_id', organisationId)
    .is('deleted_at', null)
    .order('address_line_1')

  if (entityId) propsQuery = propsQuery.eq('entity_id', entityId)

  const [orgRes, propsRes] = await Promise.all([
    sb
      .from('organisations')
      .select('name')
      .eq('id', organisationId)
      .single<{ name: string }>(),
    propsQuery,
  ])

  const orgName = orgRes.data?.name ?? 'Compliance status'
  const properties = (propsRes.data ?? []) as PropertyDbRow[]
  const propIds = properties.map((p) => p.id)

  let items: ItemDbRow[] = []
  if (propIds.length > 0) {
    const { data: rawItems } = await sb
      .from('compliance_items')
      .select(
        'id, property_id, kind, status, issue_date, expiry_date, issuer, notes',
      )
      .eq('organisation_id', organisationId)
      .in('property_id', propIds)
      .is('deleted_at', null)
    items = (rawItems ?? []) as ItemDbRow[]
  }

  const byProperty = new Map<string, ItemDbRow[]>()
  for (const it of items) {
    const arr = byProperty.get(it.property_id) ?? []
    arr.push(it)
    byProperty.set(it.property_id, arr)
  }

  let totalValid = 0
  let totalExpiring = 0
  let totalExpired = 0
  let totalMissing = 0
  let totalExempt = 0

  const groups: PropertyGroup[] = properties.map((p) => {
    // requiredComplianceKinds returns ComplianceKind[] which is a string
    // literal union; widen to string[] for transport to the document.
    const required: string[] = requiredComplianceKinds(
      p.kind as PropertyKind,
      (p.hmo_licence_kind ?? 'none') as HmoLicenceKind,
    )
    const presentKinds = new Set(
      (byProperty.get(p.id) ?? []).map((i) => i.kind),
    )

    const rows: ComplianceRow[] = (byProperty.get(p.id) ?? []).map((it) => {
      let status: ComplianceStatusKind = 'missing'
      if (it.status === 'exempt') status = 'exempt'
      else status = complianceStatus(it.expiry_date, today) as ComplianceStatusKind
      switch (status) {
        case 'valid':
          totalValid++
          break
        case 'expiring':
          totalExpiring++
          break
        case 'expired':
          totalExpired++
          break
        case 'missing':
          totalMissing++
          break
        case 'exempt':
          totalExempt++
          break
      }
      return {
        id: it.id,
        kind: it.kind,
        status,
        issueDate: it.issue_date,
        expiryDate: it.expiry_date,
        issuer: it.issuer,
        notes: it.notes,
        exemptReason: it.status === 'exempt' ? it.notes : null,
      }
    })

    for (const k of required) {
      if (!presentKinds.has(k)) {
        totalMissing++
        rows.push({
          id: `synthetic:${p.id}:${k}`,
          kind: k,
          status: 'missing',
          issueDate: null,
          expiryDate: null,
          issuer: null,
          notes: null,
          exemptReason: null,
        })
      }
    }

    const severity: Record<ComplianceStatusKind, number> = {
      expired: 0,
      missing: 1,
      expiring: 2,
      valid: 3,
      exempt: 4,
    }
    rows.sort((a, b) => {
      const s = severity[a.status] - severity[b.status]
      if (s !== 0) return s
      return a.kind.localeCompare(b.kind)
    })

    return {
      propertyId: p.id,
      addressLine1: p.address_line_1,
      postcode: p.postcode,
      entityName: p.entity?.[0]?.name ?? '—',
      requiredKinds: required,
      items: rows,
    }
  })

  return {
    organisationName: orgName,
    asOf: today,
    entityFilter: entityId,
    groups,
    totals: {
      valid: totalValid,
      expiring: totalExpiring,
      expired: totalExpired,
      missing: totalMissing,
      exempt: totalExempt,
    },
  }
}
