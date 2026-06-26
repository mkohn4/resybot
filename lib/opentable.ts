const MOBILE_BASE = "https://mobile-api.opentable.com"

export class OTOverlapError extends Error {
  constructor() { super("You already have an overlapping reservation on OpenTable at this time") }
}

function mobileHeaders(bearerToken: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearerToken}`,
    "User-Agent": "com.contextoptional.OpenTable/26.17.0.6; iPhone; iOS/26.5; 3.0;",
  }
}

export type OTSlot = {
  dateTime: string   // "2026-06-28T20:00"
  slotHash: string
  token: string      // slotAvailabilityToken
  points?: number
  slotType?: string
  diningAreaId?: string  // actual dining area id — required for lock, varies per restaurant
  requiresCreditCard?: boolean
  creditCardPolicyType?: string
}

export type OTGuestInfo = {
  firstName: string
  lastName: string
  email: string
  phone: string
  gpid: string
  customerId: string
  cardToken?: string   // Spreedly token from wallet.cards[].token — for CC-hold restaurants
  cardLast4?: string
}

// Fetch user profile from OT mobile API using bearer token.
// Used during onboarding to auto-populate name/phone/gpid/customerId/wallet card.
export async function fetchOTUserProfile(bearerToken: string): Promise<{
  firstName: string
  lastName: string
  phone: string
  gpid: string
  customerId: string
  cardToken: string
  cardLast4: string
} | null> {
  const res = await fetch(`${MOBILE_BASE}/api/v3/user/?loadInvitations=1`, {
    headers: mobileHeaders(bearerToken),
  })
  if (!res.ok) throw new Error(`OT user fetch failed: ${res.status}`)
  const data = await res.json()
  const phone = data?.phoneNumbers?.[0]?.number ?? ""
  const defaultCard = (data?.wallet?.cards ?? []).find((c: { default?: boolean }) => c.default) ?? data?.wallet?.cards?.[0]
  return {
    firstName: data?.firstName ?? "",
    lastName: data?.lastName ?? "",
    phone,
    gpid: data?.globalPersonId ?? "",
    customerId: String(data?.customerId ?? ""),
    cardToken: defaultCard?.token ?? "",
    cardLast4: defaultCard?.last4 ?? "",
  }
}

export async function findOTSlots(
  restaurantId: number,
  date: string,   // YYYY-MM-DD
  partySize: number,
  bearerToken: string
): Promise<OTSlot[]> {
  const dateTime = `${date}T19:00`
  const url = new URL(`${MOBILE_BASE}/api/v3/restaurant/${restaurantId}`)
  url.searchParams.set("dateTime", dateTime)
  url.searchParams.set("partySize", String(partySize))
  url.searchParams.set("allowPop", "true")
  url.searchParams.set("partnerId", "84")
  // availabilityToken is required for slots to be returned; {"v":3,"m":0,"p":0,"s":0,"n":0} base64-encoded
  url.searchParams.set("availabilityToken", "eyJ2IjozLCJtIjowLCJwIjowLCJzIjowLCJuIjowfQ")
  url.searchParams.set("fallbackToNextAvailable", "1")
  url.searchParams.set("forceNextAvailable", "true")
  url.searchParams.set("includeOffers", "true")
  url.searchParams.set("requestAttributeTables", "true")
  url.searchParams.set("requestTicket", "true")
  url.searchParams.set("stats", "numBooked")

  const res = await fetch(url.toString(), { headers: mobileHeaders(bearerToken) })
  if (!res.ok) throw new Error(`OT findSlots failed: ${res.status}`)
  const data = await res.json()

  // Slots live at data.availability.availability.timeslots
  const timeslots: {
    dateTime?: string; slotHash?: number | string; token?: string; available?: boolean; type?: string; points?: number
    requiresCreditCard?: boolean; creditCardPolicyType?: string
    diningAreas?: { id?: string; environment?: string; availableAttributes?: string[] }[]
  }[] = data?.availability?.availability?.timeslots ?? []

  const slots: OTSlot[] = []
  for (const slot of timeslots) {
    if (!slot.dateTime || !slot.slotHash || slot.available === false) continue
    // Filter to the requested date
    if (!slot.dateTime.startsWith(date)) continue
    // Pick first non-outdoor dining area id (skip outdoor/patio)
    const indoorArea = slot.diningAreas?.find(
      (a) => a.environment !== "OUTDOOR" && a.availableAttributes?.includes("default")
    )
    const diningAreaId = indoorArea?.id ?? slot.diningAreas?.[0]?.id ?? "1"
    slots.push({
      dateTime: slot.dateTime,
      slotHash: String(slot.slotHash),
      token: slot.token ?? "",
      points: slot.points ?? 100,
      slotType: slot.type ?? "Standard",
      diningAreaId,
      requiresCreditCard: slot.requiresCreditCard ?? false,
      creditCardPolicyType: slot.creditCardPolicyType,
    })
  }
  return slots
}

export function pickBestOTSlot(
  slots: OTSlot[],
  preferredTimes: string[],
  skip: Set<string> = new Set()
): OTSlot | null {
  const slotByTime: Record<string, OTSlot> = {}
  for (const slot of slots) {
    const time = slot.dateTime.split("T")[1]?.substring(0, 5)
    if (time && !skip.has(slot.dateTime)) slotByTime[time] = slot
  }

  for (const t of preferredTimes) {
    if (slotByTime[t]) return slotByTime[t]
  }

  return null
}

export async function bookOTSlot(
  restaurantId: number,
  slot: OTSlot,
  partySize: number,
  guest: OTGuestInfo,
  bearerToken: string
): Promise<{ reservationId: string; confirmationNumber: string }> {
  const needsCC = slot.requiresCreditCard && slot.creditCardPolicyType === "HOLD"
  if (needsCC && !guest.cardToken) {
    throw new Error("This restaurant requires a credit card hold. Reconnect your OpenTable account to add your saved card.")
  }

  // Step 1: lock the slot
  const lockBody: Record<string, unknown> = {
    dateTime: slot.dateTime,
    partySize,
    hash: slot.slotHash,
    intendedPoints: slot.points ?? 100,
    intendedPointsType: slot.slotType ?? "Standard",
    hasAccessRuleDiningAttribute: false,
    userLocation: { countryCode: "US", regionCode: "NY" },
    attribution: { partnerId: "84" },
    selectedDiningArea: { tableAttribute: "default", diningAreaId: slot.diningAreaId ?? "1" },
  }
  if (needsCC) {
    lockBody.requiresCreditCard = true
    lockBody.creditCardPolicyType = slot.creditCardPolicyType
  }

  const lockRes = await fetch(`${MOBILE_BASE}/api/v1/reservation/${restaurantId}/lock`, {
    method: "POST",
    headers: mobileHeaders(bearerToken),
    body: JSON.stringify(lockBody),
  })
  if (!lockRes.ok) {
    const err = await lockRes.text()
    throw new Error(`OT lock failed: ${lockRes.status} — ${err}`)
  }
  const lock = await lockRes.json()
  const lockId = String(lock?.id ?? "")
  if (!lockId) throw new Error("OT lock returned no id")

  // Step 2: complete the reservation
  const bookBody: Record<string, unknown> = {
    partySize,
    dateTime: slot.dateTime,
    hash: slot.slotHash,
    slotAvailabilityToken: slot.token,
    lockId,
    gpid: guest.gpid,
    dinerId: guest.customerId,
    number: guest.phone.replace(/\D/g, ""),
    countryId: "US",
    notes: "",
    type: slot.slotType ?? "Standard",
    points: slot.points ?? 100,
    loadInvitations: false,
    hasAccessRuleDiningAttribute: false,
    diningFormOptIn: false,
    loyaltyProgramOptIn: true,
    smsOptIn: true,
    attribution: { partnerId: "84" },
    selectedDiningArea: { tableAttribute: "default", diningAreaId: slot.diningAreaId ?? "1" },
    location: { latitude: 40.74, longitude: -73.98 },
  }
  if (needsCC) {
    bookBody.creditCardLock = {
      token: guest.cardToken,
      paymentProviderType: "SPREEDLY",
      last4: guest.cardLast4,
    }
  }

  const bookRes = await fetch(`${MOBILE_BASE}/api/v3/reservation/${restaurantId}`, {
    method: "POST",
    headers: mobileHeaders(bearerToken),
    body: JSON.stringify(bookBody),
  })
  if (!bookRes.ok) {
    const errText = await bookRes.text()
    if (bookRes.status === 409) {
      try {
        const errJson = JSON.parse(errText)
        const code = errJson?.errors?.[0]?.code ?? ""
        if (code === "DINER_HAS_OVERALAPPING_RESERVATION" || code === "DINER_HAS_OVERLAPPING_RESERVATION") {
          throw new OTOverlapError()
        }
      } catch (e) {
        if (e instanceof OTOverlapError) throw e
      }
    }
    throw new Error(`OT booking failed: ${bookRes.status} — ${errText}`)
  }
  const booking = await bookRes.json()
  return {
    reservationId: String(booking?.id ?? booking?.gpid ?? "unknown"),
    confirmationNumber: String(booking?.confirmationNumber ?? ""),
  }
}

// Venue search via mobile autocomplete API — Bearer token required.
// Returns results from interspersedResults[] (the populated array in the response).
export async function searchOTVenues(query: string, bearerToken: string): Promise<{
  id: number
  name: string
  neighborhood: string
  cuisine: string
  city: string
}[]> {
  const res = await fetch(`${MOBILE_BASE}/api/v4/personalize/autocompleteInterspersed`, {
    method: "PUT",
    headers: mobileHeaders(bearerToken),
    body: JSON.stringify({
      term: query,
      userLocation: { latitude: 40.74, longitude: -73.98 },
      location: { latitude: 40.74, longitude: -73.98 },
      includeListings: true,
    }),
  })
  if (!res.ok) return []
  const data = await res.json()
  const hits: { id?: string; name?: string; address?: { city?: string }; neighborhoodName?: string; cuisines?: { name?: string }[] }[] =
    data?.interspersedResults ?? data?.results ?? []
  return hits
    .filter((r) => r.id && r.name && r.id !== "" )
    .map((r) => ({
      id: Number(r.id),
      name: r.name ?? "Unknown",
      neighborhood: r.neighborhoodName ?? r.address?.city ?? "NYC",
      cuisine: r.cuisines?.[0]?.name ?? "",
      city: r.address?.city ?? "New York",
    }))
}
