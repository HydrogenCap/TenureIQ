// lib/domain/hmo.ts

export type HmoLicenceKind = 'none' | 'mandatory' | 'additional' | 'selective'

export function mandatoryLicenceRequired(
  occupants: number,
  households: number
): boolean {
  return occupants >= 5 && households >= 2
}

export type HmoLicenceStatus =
  | 'valid'
  | 'expiring'
  | 'expired'
  | 'missing_required'
  | 'not_required'

export function hmoLicenceStatus(
  input: {
    hmoLicenceKind: HmoLicenceKind
    hmoLicenceExpiry: string | Date | null
    occupants: number
    households: number
  },
  today: Date = new Date()
): HmoLicenceStatus {
  const required = mandatoryLicenceRequired(input.occupants, input.households)

  if (input.hmoLicenceKind === 'none') {
    return required ? 'missing_required' : 'not_required'
  }

  if (!input.hmoLicenceExpiry) return 'missing_required'

  const expiry =
    input.hmoLicenceExpiry instanceof Date
      ? input.hmoLicenceExpiry
      : new Date(input.hmoLicenceExpiry)

  if (expiry < today) return 'expired'

  const daysUntil = (expiry.getTime() - today.getTime()) / 86_400_000
  return daysUntil <= 60 ? 'expiring' : 'valid'
}

// Housing Act 2004 statutory bedroom minimums
const MIN_BEDROOM_SQM = {
  one_adult: 6.51,
  two_adults: 10.22,
  one_child: 4.64,
} as const

export type RoomSizingResult = {
  compliantOneAdult: boolean
  compliantTwoAdults: boolean
  compliantOneChild: boolean
}

export function bedroomStatutoryCheck(floorAreaSqm: number): RoomSizingResult {
  return {
    compliantOneAdult: floorAreaSqm >= MIN_BEDROOM_SQM.one_adult,
    compliantTwoAdults: floorAreaSqm >= MIN_BEDROOM_SQM.two_adults,
    compliantOneChild: floorAreaSqm >= MIN_BEDROOM_SQM.one_child,
  }
}

// LACORS kitchen guidance — advisory, not statutory
export type KitchenSizingResult = 'compliant' | 'undersized' | 'borderline'

export function lacorsKitchenStatus(
  kitchenAreaSqm: number,
  occupantsSharing: number
): KitchenSizingResult {
  if (occupantsSharing <= 4) {
    if (kitchenAreaSqm >= 5) return 'compliant'
    if (kitchenAreaSqm >= 4) return 'borderline'
    return 'undersized'
  }
  if (occupantsSharing === 5) {
    if (kitchenAreaSqm >= 7) return 'compliant'
    if (kitchenAreaSqm >= 6) return 'borderline'
    return 'undersized'
  }
  // 6+
  if (kitchenAreaSqm >= 9) return 'compliant'
  if (kitchenAreaSqm >= 7) return 'borderline'
  return 'undersized'
}
