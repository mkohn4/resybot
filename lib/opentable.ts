const MOBILE_BASE = "https://mobile-api.opentable.com"
const GQL_URL = "https://www.opentable.com/dapi/fe/gql"

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
}

export type OTGuestInfo = {
  firstName: string
  lastName: string
  email: string
  phone: string
  gpid: string
  customerId: string
}

// Fetch user profile from OT mobile API using bearer token.
// Used during onboarding to auto-populate name/phone/gpid/customerId.
export async function fetchOTUserProfile(bearerToken: string): Promise<{
  firstName: string
  lastName: string
  phone: string
  gpid: string
  customerId: string
} | null> {
  const res = await fetch(`${MOBILE_BASE}/api/v3/user/?loadInvitations=0`, {
    headers: mobileHeaders(bearerToken),
  })
  if (!res.ok) throw new Error(`OT user fetch failed: ${res.status}`)
  const data = await res.json()
  const phone = data?.phoneNumbers?.[0]?.number ?? ""
  return {
    firstName: data?.firstName ?? "",
    lastName: data?.lastName ?? "",
    phone,
    gpid: data?.globalPersonId ?? "",
    customerId: String(data?.customerId ?? ""),
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
  url.searchParams.set("forceNextAvailable", "true")
  url.searchParams.set("includeNextAvailable", "true")
  url.searchParams.set("allowPop", "true")
  url.searchParams.set("includeOffers", "true")
  url.searchParams.set("requestTicket", "true")
  url.searchParams.set("requestAttributeTables", "true")
  url.searchParams.set("stats", "numBooked")
  url.searchParams.set("partnerId", "84")

  const res = await fetch(url.toString(), { headers: mobileHeaders(bearerToken) })
  if (!res.ok) throw new Error(`OT findSlots failed: ${res.status}`)
  const data = await res.json()

  const slots: OTSlot[] = []
  for (const day of data?.suggestedAvailability ?? []) {
    for (const slot of day?.timeslots ?? []) {
      if (!slot.dateTime || !slot.slotHash) continue
      slots.push({
        dateTime: slot.dateTime,
        slotHash: String(slot.slotHash),
        token: slot.token ?? slot.slotAvailabilityToken ?? "",
      })
    }
  }
  return slots
}

export function pickBestOTSlot(
  slots: OTSlot[],
  preferredTimes: string[]
): OTSlot | null {
  const slotByTime: Record<string, OTSlot> = {}
  for (const slot of slots) {
    const time = slot.dateTime.split("T")[1]?.substring(0, 5)
    if (time) slotByTime[time] = slot
  }

  for (const t of preferredTimes) {
    if (slotByTime[t]) return slotByTime[t]
  }

  // Fallback: first slot in lunch (11:30–13:30) or dinner (17:30–22:30) window
  for (const slot of slots) {
    const time = slot.dateTime.split("T")[1]?.substring(0, 5)
    if (!time) continue
    const [h, m] = time.split(":").map(Number)
    const mins = h * 60 + m
    if ((mins >= 11 * 60 + 30 && mins <= 13 * 60 + 30) || (mins >= 17 * 60 + 30 && mins <= 22 * 60 + 30)) return slot
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
  // Step 1: lock the slot
  const lockRes = await fetch(`${MOBILE_BASE}/api/v1/reservation/${restaurantId}/lock`, {
    method: "POST",
    headers: mobileHeaders(bearerToken),
    body: JSON.stringify({
      dateTime: slot.dateTime,
      partySize,
      hash: slot.slotHash,
      attribution: { partnerId: "84" },
      selectedDiningArea: { tableAttribute: "default", diningAreaId: "1" },
    }),
  })
  if (!lockRes.ok) {
    const err = await lockRes.text()
    throw new Error(`OT lock failed: ${lockRes.status} — ${err}`)
  }
  const lock = await lockRes.json()
  const lockId = String(lock?.id ?? "")
  if (!lockId) throw new Error("OT lock returned no id")

  // Step 2: complete the reservation
  const bookRes = await fetch(`${MOBILE_BASE}/api/v3/reservation/${restaurantId}`, {
    method: "POST",
    headers: mobileHeaders(bearerToken),
    body: JSON.stringify({
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
      loadInvitations: false,
      attribution: { partnerId: "84" },
      selectedDiningArea: { tableAttribute: "default", diningAreaId: "1" },
      location: { latitude: 40.74, longitude: -73.98 },
    }),
  })
  if (!bookRes.ok) {
    const err = await bookRes.text()
    throw new Error(`OT booking failed: ${bookRes.status} — ${err}`)
  }
  const booking = await bookRes.json()
  return {
    reservationId: String(booking?.id ?? booking?.gpid ?? "unknown"),
    confirmationNumber: String(booking?.confirmationNumber ?? ""),
  }
}

// Venue search — still uses the web GQL endpoint (no auth needed, no booking)
export async function searchOTVenues(query: string): Promise<{
  id: number
  name: string
  neighborhood: string
  cuisine: string
  city: string
}[]> {
  function gqlHeaders() {
    const csrf = crypto.randomUUID()
    return {
      "content-type": "application/json",
      accept: "*/*",
      origin: "https://www.opentable.com",
      referer: "https://www.opentable.com/",
      "x-csrf-token": csrf,
      cookie: `OT-SessionId=${crypto.randomUUID()}`,
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    }
  }

  const body = {
    operationName: "Autocomplete",
    variables: { term: query, latitude: 40.758, longitude: -73.9855, useNewVersion: true },
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: "3cabca79abcb0db395d3cbebb4d47d41f3ddd69442eba3a57f76b943cceb8cf4",
      },
    },
  }

  const toResult = (r: { id?: number; name?: string; metroName?: string; neighborhoodName?: string; cuisineList?: string[] }) => ({
    id: r.id ?? 0,
    name: r.name ?? "Unknown",
    neighborhood: r.neighborhoodName ?? r.metroName ?? "NYC",
    cuisine: r.cuisineList?.[0] ?? "",
    city: r.metroName ?? "New York",
  })

  const res = await fetch(`${GQL_URL}?optype=query&opname=Autocomplete`, {
    method: "POST",
    headers: gqlHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) return []
  const data = await res.json()
  const results =
    data?.data?.autocomplete?.autocompleteResults ??
    data?.data?.autocomplete?.restaurants ??
    data?.data?.restaurants ??
    []
  const hits = results
    .filter((r: { id?: number; name?: string }) => r.id && r.name)
    .map(toResult)
  if (hits.length > 0) return hits

  // Retry with legacy index
  const res2 = await fetch(`${GQL_URL}?optype=query&opname=Autocomplete`, {
    method: "POST",
    headers: gqlHeaders(),
    body: JSON.stringify({ ...body, variables: { ...body.variables, useNewVersion: false } }),
  })
  if (!res2.ok) return []
  const data2 = await res2.json()
  const results2 =
    data2?.data?.autocomplete?.autocompleteResults ??
    data2?.data?.autocomplete?.restaurants ??
    []
  return results2.filter((r: { id?: number; name?: string }) => r.id && r.name).map(toResult)
}
