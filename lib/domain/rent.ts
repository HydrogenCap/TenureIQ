// lib/domain/rent.ts
// Rent-period arithmetic. Always pence-in / pence-out; never floats for money.

export type RentPeriod = 'weekly' | 'four_weekly' | 'monthly' | 'annual'

// (rent * weeksPerPeriod * 52 / 12) — integer arithmetic via bigint.
export function monthlyRentPence(rentPence: bigint, period: RentPeriod): bigint {
  switch (period) {
    case 'monthly':
      return rentPence
    case 'weekly':
      return (rentPence * 52n) / 12n
    case 'four_weekly':
      return (rentPence * 13n) / 12n
    case 'annual':
      return rentPence / 12n
  }
}

export function annualRentPence(rentPence: bigint, period: RentPeriod): bigint {
  switch (period) {
    case 'monthly':
      return rentPence * 12n
    case 'weekly':
      return rentPence * 52n
    case 'four_weekly':
      return rentPence * 13n
    case 'annual':
      return rentPence
  }
}

export function weeklyRentPence(rentPence: bigint, period: RentPeriod): bigint {
  switch (period) {
    case 'weekly':
      return rentPence
    case 'four_weekly':
      return rentPence / 4n
    case 'monthly':
      return (rentPence * 12n) / 52n
    case 'annual':
      return rentPence / 52n
  }
}
