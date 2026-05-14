---
name: tenureiq-shadcn-patterns
description: UI composition patterns for TenureIQ — shadcn/ui + Tailwind v4 + TanStack Table + React Hook Form. Use whenever building a page, list view, detail view, form, dashboard tile, navigation, empty state, or loading skeleton. Trigger on any work in app/(app)/, components/, or any UI change. Without this skill, every milestone reinvents the same layouts and the product drifts visually within a week.
---

# TenureIQ UI Patterns

shadcn/ui (New York, neutral) + Tailwind v4 + TanStack Table v8 + React Hook Form + Zod. Every page in TenureIQ should be assembled from these patterns. Drift is the enemy — consistency across 80+ pages is what separates a product from a prototype.

## When to load deeper references

| Building a... | Read |
|---|---|
| List page (table with filters, search, sort, URL state) | `references/list-page.md` |
| Detail page (header + tabs + KPI tiles + edit) | `references/detail-page.md` |
| Form (create/edit, single or stepper) | `references/form-page.md` |
| TanStack Table column setup, filters, pagination | `references/data-table.md` |
| Empty state, loading skeleton, error boundary | `references/empty-and-loading.md` |
| Navigation chrome, breadcrumbs, sidebar | `references/navigation.md` |

## Visual language (locked, don't drift)

- Tailwind v4 with the theme tokens already in `app/globals.css` (oklch palette, neutral base).
- Border radius: `--radius: 0.5rem` (use `rounded-md` 8px / `rounded-lg` 12px).
- Density: comfortable on desktop, compact on mobile. Default row padding `py-3`.
- Typography scale: `text-2xl` page titles, `text-base` body, `text-sm` table rows, `text-xs` muted labels.
- Colour use: monochrome by default; **colour reserved for status semantics**. Red = blocker/expired, Amber = expiring/warning, Green = compliant/positive, Blue = informational only.
- Charts use Recharts with `--color-primary` as the line and `--color-muted` for grid; no rainbow palettes.

## Shadcn components in active use

Generate once via `npx shadcn@latest add <component>`. The active set:

```
button, card, input, label, textarea, select, checkbox, radio-group,
dialog, sheet, drawer, dropdown-menu, popover, tooltip,
tabs, accordion, separator, badge, avatar,
table, pagination, command, scroll-area,
toast (sonner), alert, alert-dialog,
form (label/error wrappers), skeleton
```

Do not pull in components you aren't using yet — `components/ui/` should map 1:1 to what's actually rendered.

## File conventions

```
app/(app)/<resource>/
  page.tsx               # list (server component)
  loading.tsx            # streaming skeleton
  error.tsx              # error boundary
  new/
    page.tsx             # create form
  [id]/
    page.tsx             # detail (server)
    loading.tsx
    edit/page.tsx        # edit form (or use drawer pattern)
  _components/           # private to this resource
    <resource>-table.tsx
    <resource>-form.tsx
    <resource>-filters.tsx
  actions.ts             # server actions
```

`_components/` (leading underscore) tells Next.js this isn't a route segment.

## The three canonical page patterns

### List page

```
┌──────────────────────────────────────────────┐
│ Properties             [+ New property]      │  ← page header
├──────────────────────────────────────────────┤
│ [search]  [Entity ▾] [EPC ▾] [Status ▾] [×]  │  ← filter bar
├──────────────────────────────────────────────┤
│ ▢ Address     Entity     EPC  Status  Value  │  ← table
│ ▢ 12 Holmer…  IPLIK Ltd  C    Active  £325k  │
│ …                                            │
├──────────────────────────────────────────────┤
│ 18 of 47           ‹ 1 2 3 ›                 │  ← pagination
└──────────────────────────────────────────────┘
```

### Detail page

```
┌──────────────────────────────────────────────┐
│ ← Back  |  12 Holmer Road       [Edit ▾]     │  ← header with back + actions
│ Hereford HR4 9TZ • HMO • IPLIK Ltd           │
├──────────────────────────────────────────────┤
│ [Value £325k] [Equity £125k] [LTV 62%] [Yield 8.4%]  │  ← KPI tiles
├──────────────────────────────────────────────┤
│ Overview | Units | Tenancies | Finance |     │  ← tabs
│ Compliance | Maintenance | Documents         │
├──────────────────────────────────────────────┤
│ <active tab content>                         │
└──────────────────────────────────────────────┘
```

### Form page

```
┌──────────────────────────────────────────────┐
│ New property                                 │
│ Add a property to your portfolio.            │
├──────────────────────────────────────────────┤
│ Section: Basics                              │
│   Entity *           [select ▾]              │
│   Address line 1 *   [text         ]         │
│   Postcode *         [TEXT        ]          │
│   Kind *             [select ▾]              │
│                                              │
│ Section: Acquisition                         │
│   Purchase price *   [£         ] (in £)     │
│   Purchase date *    [date         ]         │
│                                              │
│ Section: Energy                              │
│   EPC rating         [select ▾]              │
│   EPC expiry         [date         ]         │
│                                              │
│ [Cancel]                       [Create]      │
└──────────────────────────────────────────────┘
```

All forms use React Hook Form + zodResolver, and submit to a server action returning `ActionResult<T>` (see `tenureiq-conventions/references/server-action-shape.md`).

## Anti-patterns (refuse to ship)

1. **Custom table from scratch.** Use TanStack Table v8 + shadcn `<Table>` primitives. Hand-rolled tables drift, break sort, and miss accessibility.
2. **Inconsistent KPI tile.** One reusable `<KpiTile>` component; no bespoke per-page tiles.
3. **Filter state in component state.** Filter state lives in URL search params via `nuqs` or manual `useSearchParams`. Sharing a filtered view = sharing the URL.
4. **Modal forms for non-trivial input.** Modals for confirm/destructive actions only. Multi-field creates/edits go on a dedicated route OR a `<Sheet>` (side drawer) for in-context editing — never a centered modal.
5. **Soft delete with a "Delete" button labelled identically.** Soft delete is "Archive". Permanent delete is a separate confirmed action available to admins+ only.
6. **Toast for errors.** Errors render inline at the source. Toasts confirm async success ("Property created"). Negative-by-toast is a bug.
7. **Spinner blocking the entire screen.** Use streaming + suspense + skeletons. The screen renders chrome immediately; data fills in.
8. **Recharts default styling.** Always override with the theme palette and `tickFormatter` for £/% values.
9. **Page titles in `<h1 className="...">` without semantic structure.** One `<h1>` per page; subsections use `<h2>`.

## Reusable primitives (build once, used everywhere)

Live in `components/`:

- `<KpiTile label value sub trend />` — the four-up dashboard tile
- `<PageHeader title description actions />` — page chrome
- `<DataTable columns data />` — TanStack-backed table with sort, pagination, row selection
- `<FilterBar><Filter><FilterSelect /></Filter></FilterBar>` — URL-state filters
- `<EmptyState icon title description action />` — no-data state
- `<FormSection title description><FormField name label hint>...</FormField></FormSection>` — form layout
- `<StatusBadge status />` — colour-mapped pill: maps statuses to semantic colour
- `<MoneyDisplay pence />` — formats bigint pence → £ with optional precise variant
- `<DateDisplay date format />` — formats DateLike to UK locale, with `formatDistance` variant for "in 25 days"
- `<ConfirmDialog title description onConfirm />` — destructive action confirmation

These have one home. New pages reuse, not redefine.

## Status colour mapping (the only place this is encoded)

```ts
// components/status-badge.tsx
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  // Compliance
  valid: 'success',
  expiring: 'warning',
  expired: 'destructive',
  missing: 'destructive',
  exempt: 'muted',
  // MEES
  compliant: 'success',
  let_blocked: 'destructive',
  epc_expired: 'destructive',
  epc_missing: 'warning',
  // Tenancies
  active: 'success',
  ended: 'muted',
  notice_given: 'warning',
  // Units
  occupied: 'success',
  vacant: 'warning',
  reserved: 'default',
  maintenance: 'warning',
  offline: 'muted',
  // AASC area
  open: 'success',
  limited: 'warning',
  closed: 'destructive',
  unknown: 'muted',
  // Maintenance jobs
  reported: 'warning',
  triaged: 'default',
  in_progress: 'default',
  awaiting_quote: 'warning',
  completed: 'success',
  cancelled: 'muted',
}
```

If you find yourself adding a new status, update this map — do not invent inline colours.
