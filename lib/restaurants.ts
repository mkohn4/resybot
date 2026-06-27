export type Restaurant = {
  name: string
  venueId: number | null
  neighborhood: string
  cuisine: string
  daysOut: number
  releaseTime: string | null // HH:MM ET, 24h
  releaseNotes: string
  priceRange: string
  platform?: "resy" | "opentable"  // defaults to "resy" if omitted
}

export const NYC_RESTAURANTS: Restaurant[] = [
  {
    name: "Carbone",
    venueId: null,
    neighborhood: "Greenwich Village",
    cuisine: "Italian-American",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Drops at midnight ET exactly 28 days out. One of the hardest tables in NYC — gone in seconds.",
    priceRange: "$$$$",
  },
  {
    name: "Don Angie",
    venueId: 994474,
    neighborhood: "West Village",
    cuisine: "Italian-American",
    daysOut: 7,
    releaseTime: "09:00",
    releaseNotes: "Reservations open 7 days in advance at 9am ET, exclusively on OpenTable.",
    priceRange: "$$$",
    platform: "opentable",
  },
  {
    name: "Lilia",
    venueId: null,
    neighborhood: "Williamsburg",
    cuisine: "Italian",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Notoriously difficult.",
    priceRange: "$$$",
  },
  {
    name: "4 Charles Prime Rib",
    venueId: null,
    neighborhood: "West Village",
    cuisine: "Steakhouse",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight ET 28 days out. ~30 seats — one of the most competitive bookings in NYC.",
    priceRange: "$$$$",
  },
  {
    name: "Rezdôra",
    venueId: null,
    neighborhood: "Flatiron",
    cuisine: "Northern Italian",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Very competitive pasta-focused restaurant.",
    priceRange: "$$$",
  },
  {
    name: "Atomix",
    venueId: null,
    neighborhood: "Midtown",
    cuisine: "Modern Korean",
    daysOut: 60,
    releaseTime: "10:00",
    releaseNotes: "2-Michelin-star. Opens ~60 days out at 10am ET. Tasting menu only.",
    priceRange: "$$$$",
  },
  {
    name: "Jua",
    venueId: null,
    neighborhood: "Flatiron",
    cuisine: "Modern Korean",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Michelin-starred tasting menu.",
    priceRange: "$$$$",
  },
  {
    name: "Torrisi",
    venueId: null,
    neighborhood: "Nolita",
    cuisine: "Italian-American",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Major Rich Torrisi comeback restaurant.",
    priceRange: "$$$$",
  },
  {
    name: "Frenchette",
    venueId: null,
    neighborhood: "Tribeca",
    cuisine: "French",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. James Beard-winning. Bar walk-ins available.",
    priceRange: "$$$",
  },
  {
    name: "Le Bernardin",
    venueId: null,
    neighborhood: "Midtown West",
    cuisine: "French Seafood",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "3-Michelin-star. Midnight drop 28 days out. Tasting menu and à la carte.",
    priceRange: "$$$$",
  },
  {
    name: "Laser Wolf",
    venueId: null,
    neighborhood: "Williamsburg",
    cuisine: "Israeli Grill",
    daysOut: 28,
    releaseTime: "09:00",
    releaseNotes: "9am ET drop 28 days out. Rooftop. Very popular summer spot.",
    priceRange: "$$$",
  },
  {
    name: "Gage & Tollner",
    venueId: null,
    neighborhood: "Downtown Brooklyn",
    cuisine: "American Steakhouse",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Historic NYC revival.",
    priceRange: "$$$",
  },
  {
    name: "Gramercy Tavern",
    venueId: null,
    neighborhood: "Gramercy",
    cuisine: "American",
    daysOut: 28,
    releaseTime: "09:00",
    releaseNotes: "USHG group — 9am drop. Tavern room walk-ins available. Dining room books 28 days out.",
    priceRange: "$$$",
  },
  {
    name: "Eleven Madison Park",
    venueId: null,
    neighborhood: "Flatiron",
    cuisine: "Modern American (Plant-based)",
    daysOut: 60,
    releaseTime: "09:00",
    releaseNotes: "3-Michelin-star. Opens ~60 days out at 9am. Tasting menu only. $365+/person.",
    priceRange: "$$$$",
  },
  {
    name: "The Grill",
    venueId: null,
    neighborhood: "Midtown East",
    cuisine: "American Continental",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Four Seasons room revival. Power dining.",
    priceRange: "$$$$",
  },
  {
    name: "Nobu",
    venueId: null,
    neighborhood: "Tribeca",
    cuisine: "Japanese-Peruvian",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Large room — more available than most.",
    priceRange: "$$$$",
  },
  {
    name: "Balthazar",
    venueId: null,
    neighborhood: "SoHo",
    cuisine: "French Brasserie",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Large brasserie — easier to book than boutique spots.",
    priceRange: "$$$",
  },
  {
    name: "Le Coucou",
    venueId: null,
    neighborhood: "SoHo",
    cuisine: "French",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Daniel Rose's acclaimed French restaurant.",
    priceRange: "$$$$",
  },
  {
    name: "Dirty French",
    venueId: null,
    neighborhood: "Lower East Side",
    cuisine: "French",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Torrisi/Zalaznick group. Easier than Carbone.",
    priceRange: "$$$",
  },
  {
    name: "Crown Shy",
    venueId: null,
    neighborhood: "Financial District",
    cuisine: "Modern American",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. James Kent's Michelin-starred FiDi restaurant.",
    priceRange: "$$$",
  },
  {
    name: "Estela",
    venueId: null,
    neighborhood: "Nolita",
    cuisine: "Mediterranean",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Bar walk-ins available. Very competitive for dinner.",
    priceRange: "$$$",
  },
  {
    name: "Cosme",
    venueId: null,
    neighborhood: "Flatiron",
    cuisine: "Mexican",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Enrique Olvera. One of NYC's best Mexican restaurants.",
    priceRange: "$$$$",
  },
  {
    name: "L'Artusi",
    venueId: null,
    neighborhood: "West Village",
    cuisine: "Italian",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Bar seats often available.",
    priceRange: "$$$",
  },
  {
    name: "Daniel",
    venueId: null,
    neighborhood: "Upper East Side",
    cuisine: "French",
    daysOut: 28,
    releaseTime: "09:00",
    releaseNotes: "2-Michelin-star. Morning release 28 days out.",
    priceRange: "$$$$",
  },
  {
    name: "Jean-Georges",
    venueId: null,
    neighborhood: "Columbus Circle",
    cuisine: "French-American",
    daysOut: 28,
    releaseTime: "09:00",
    releaseNotes: "3-Michelin-star. Morning release 28 days out.",
    priceRange: "$$$$",
  },
  {
    name: "Ci Siamo",
    venueId: null,
    neighborhood: "Hudson Yards",
    cuisine: "Italian",
    daysOut: 28,
    releaseTime: "00:00",
    releaseNotes: "Midnight drop 28 days out. Danny Meyer's Italian restaurant.",
    priceRange: "$$$",
  },
  {
    name: "Momofuku Ko",
    venueId: null,
    neighborhood: "East Village",
    cuisine: "Modern American",
    daysOut: 7,
    releaseTime: "10:00",
    releaseNotes: "Opens 7 days out at 10am ET. Counter tasting menu. 2 Michelin stars. Shorter booking window.",
    priceRange: "$$$$",
  },
]

export function getRestaurantByVenueId(venueId: number): Restaurant | undefined {
  return NYC_RESTAURANTS.find((r) => r.venueId === venueId)
}

// How far ET is ahead of UTC at a given instant, in ms (negative — ET is behind UTC).
// Computed from Intl so it's correct for both EDT and EST, independent of the
// runtime's own local timezone (Vercel runs in UTC).
function etOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs))
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const hour = p.hour === "24" ? 0 : Number(p.hour)
  const asIfUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second))
  return asIfUtc - utcMs
}

// Given an ET wall-clock time (y, mo, d, h, mi), return the corresponding UTC instant.
function etWallClockToUTC(y: number, mo: number, d: number, h: number, mi: number): Date {
  const guess = Date.UTC(y, mo, d, h, mi, 0)
  // Subtract the ET offset at that instant to get true UTC. One correction is exact
  // except within the ~1h DST transition window, which never coincides with a drop time.
  return new Date(guess - etOffsetMs(guess))
}

export function suggestSnipeTime(restaurant: Restaurant, targetDate: Date): Date | null {
  if (!restaurant.releaseTime || restaurant.daysOut === 0) return null

  const release = new Date(targetDate)
  release.setDate(release.getDate() - restaurant.daysOut)

  const [hours, minutes] = restaurant.releaseTime.split(":").map(Number)

  // releaseTime is an ET wall-clock time on the release date — convert to the UTC instant
  return etWallClockToUTC(release.getFullYear(), release.getMonth(), release.getDate(), hours, minutes)
}
