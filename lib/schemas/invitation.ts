// lib/schemas/invitation.ts
// Validation for team invitations. Owners are not invitable — ownership is
// established at organisation creation (see app/onboarding/actions.ts).

import { z } from 'zod'

export const ROLES = ['admin', 'manager', 'accountant', 'viewer'] as const

export type InvitableRole = (typeof ROLES)[number]

export const ROLE_LABELS: Record<InvitableRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  accountant: 'Accountant',
  viewer: 'Viewer',
}

export const InvitationCreateSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  role: z.enum(ROLES),
})

export type InvitationCreate = z.infer<typeof InvitationCreateSchema>
