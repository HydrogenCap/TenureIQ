// lib/schemas/organisation.ts

import { z } from 'zod'

export const OrganisationCreateSchema = z.object({
  name: z.string().min(2, 'Organisation name is required').max(120),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
})

export type OrganisationCreate = z.infer<typeof OrganisationCreateSchema>

export const InviteCreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'manager', 'accountant', 'viewer']),
})

export type InviteCreate = z.infer<typeof InviteCreateSchema>
