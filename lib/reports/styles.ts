// lib/reports/styles.ts
// Shared @react-pdf StyleSheet for every TenureIQ report. Inter is the
// design intent but registering a webfont needs an outbound HTTP fetch
// at render time, which is flaky in serverless. v1 ships with the
// built-in Helvetica — visually consistent, no flake risk. Swap in
// Font.register(...) once we mirror the woff to our own bucket.

import { StyleSheet } from '@react-pdf/renderer'

export const COLOR = {
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  borderStrong: '#94a3b8',
  bg: '#ffffff',
  bgSubtle: '#f8fafc',
  primary: '#0f172a',
  success: '#16a34a',
  warning: '#d97706',
  destructive: '#dc2626',
  accent: '#1e293b',
} as const

export const styles = StyleSheet.create({
  page: {
    paddingTop: 60,
    paddingBottom: 50,
    paddingHorizontal: 36,
    fontSize: 10,
    color: COLOR.text,
    fontFamily: 'Helvetica',
  },
  // --- header / footer ---
  header: {
    position: 'absolute',
    top: 20,
    left: 36,
    right: 36,
    borderBottom: `1px solid ${COLOR.border}`,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerOrg: { fontSize: 14, fontWeight: 'bold', color: COLOR.text },
  headerReport: { fontSize: 9, color: COLOR.muted },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    borderTop: `1px solid ${COLOR.border}`,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLOR.muted,
  },
  // --- typography ---
  h1: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  h2: { fontSize: 13, fontWeight: 'bold', marginTop: 16, marginBottom: 6 },
  h3: { fontSize: 11, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  small: { fontSize: 8, color: COLOR.muted },
  muted: { color: COLOR.muted },
  // --- KPI grid ---
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  kpiTile: {
    flex: 1,
    padding: 8,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 4,
  },
  kpiLabel: { fontSize: 8, color: COLOR.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 14, fontWeight: 'bold', marginTop: 2 },
  kpiSub: { fontSize: 8, color: COLOR.muted, marginTop: 2 },
  // --- table ---
  table: { marginTop: 4, borderTop: `1px solid ${COLOR.border}` },
  tr: {
    flexDirection: 'row',
    borderBottom: `1px solid ${COLOR.border}`,
    paddingVertical: 4,
  },
  trHead: { backgroundColor: COLOR.bgSubtle, paddingVertical: 6 },
  td: { paddingHorizontal: 4, fontSize: 9 },
  tdHead: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: COLOR.muted },
  // --- callouts ---
  alert: {
    padding: 8,
    marginVertical: 6,
    borderLeft: `3px solid ${COLOR.destructive}`,
    backgroundColor: '#fef2f2',
    fontSize: 9,
  },
  noteRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  noteLabel: { width: 100, color: COLOR.muted, fontSize: 9 },
  noteValue: { flex: 1, fontSize: 9 },
})

// Status colour helper for pills/tags.
export function statusColour(status: string): string {
  switch (status) {
    case 'valid':
    case 'active':
    case 'compliant':
    case 'completed':
      return COLOR.success
    case 'expiring':
    case 'expiring_soon':
    case 'warning':
    case 'awaiting_quote':
    case 'awaiting_invoice':
    case 'in_progress':
    case 'notice_given':
      return COLOR.warning
    case 'expired':
    case 'missing':
    case 'let_blocked':
    case 'cancelled':
    case 'terminated':
      return COLOR.destructive
    default:
      return COLOR.muted
  }
}
