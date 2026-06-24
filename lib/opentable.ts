const DAPI_BASE = "https://www.opentable.com/dapi"
const GQL_URL = "https://www.opentable.com/dapi/fe/gql"

// Static CSRF token — confirmed working across multiple open-source repos
const CSRF_TOKEN = "2b167092-25e4-4f0d-a4a5-6f51e18d24e3"

const BASE_HEADERS = {
  "content-type": "application/json",
  accept: "*/*",
  origin: "https://www.opentable.com",
  referer: "https://www.opentable.com/",
  "x-csrf-token": CSRF_TOKEN,
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

export type OTSlot = {
  dateTime: string       // "2024-03-15T19:30:00"
  slotHash: string
  slotAvailabilityToken: string
  timeOffsetMinutes: number
}

export type OTGuestInfo = {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export async function findOTSlots(
  restaurantId: number,
  date: string, // YYYY-MM-DD
  partySize: number
): Promise<OTSlot[]> {
  const res = await fetch(`${GQL_URL}?optype=query&opname=RestaurantsAvailability`, {
    method: "POST",
    headers: BASE_HEADERS,
    body: JSON.stringify({
      operationName: "RestaurantsAvailability",
      variables: {
        restaurantIds: [restaurantId],
        date,
        time: "19:00",
        partySize,
        databaseRegion: "NA",
        onlyPop: false,
        forwardDays: 0,
        requireTimes: false,
        requireTypes: [],
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "e6b87021ed6e865a7778aa39d35d09864c1be29c683c707602dd3de43c854d86",
        },
      },
    }),
  })

  if (!res.ok) throw new Error(`OT findSlots failed: ${res.status}`)
  const data = await res.json()

  const slots: OTSlot[] = []
  const availability = data?.data?.availability ?? []
  for (const venue of availability) {
    for (const day of venue.availabilityDays ?? []) {
      for (const slot of day.slots ?? []) {
        if (!slot.isAvailable) continue
        // dateTime assembled from date + slot offset
        const offsetMins = slot.timeOffsetMinutes ?? 0
        const [h, m] = [Math.floor(offsetMins / 60), offsetMins % 60]
        const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
        slots.push({
          dateTime: `${date}T${timeStr}`,
          slotHash: slot.slotHash,
          slotAvailabilityToken: slot.slotAvailabilityToken,
          timeOffsetMinutes: offsetMins,
        })
      }
    }
  }
  return slots
}

export function pickBestOTSlot(
  slots: OTSlot[],
  preferredTimes: string[] // ["20:00", "20:15", ...]
): OTSlot | null {
  const slotByTime: Record<string, OTSlot> = {}
  for (const slot of slots) {
    const time = slot.dateTime.split("T")[1]?.substring(0, 5)
    if (time) slotByTime[time] = slot
  }

  // Try preferred times in order
  for (const t of preferredTimes) {
    if (slotByTime[t]) return slotByTime[t]
  }

  // Fallback: first slot in 6:30pm–9pm window
  for (const slot of slots) {
    const time = slot.dateTime.split("T")[1]?.substring(0, 5)
    if (!time) continue
    const [h, m] = time.split(":").map(Number)
    const mins = h * 60 + m
    if (mins >= 18 * 60 + 30 && mins <= 21 * 60) return slot
  }

  return null
}

export async function bookOTSlot(
  restaurantId: number,
  slot: OTSlot,
  date: string,
  partySize: number,
  guest: OTGuestInfo
): Promise<{ reservationId: string }> {
  const res = await fetch(`${DAPI_BASE}/booking/make-reservation`, {
    method: "POST",
    headers: BASE_HEADERS,
    body: JSON.stringify({
      restaurantId,
      slotAvailabilityToken: slot.slotAvailabilityToken,
      slotHash: slot.slotHash,
      isModify: false,
      reservationDateTime: slot.dateTime,
      partySize,
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phoneNumber: guest.phone.replace(/\D/g, ""),
      phoneNumberCountryId: "US",
      country: "US",
      reservationType: "Standard",
      reservationAttribute: "default",
      pointsType: "Standard",
      points: 100,
      diningAreaId: 1,
      optInEmailRestaurant: false,
      additionalServiceFees: [],
      tipAmount: 0,
      tipPercent: 0,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OT booking failed: ${res.status} — ${errText}`)
  }
  const data = await res.json()
  return { reservationId: String(data?.reservationId ?? data?.id ?? "unknown") }
}

export async function searchOTVenues(query: string): Promise<{
  id: number
  name: string
  neighborhood: string
  cuisine: string
  city: string
}[]> {
  const res = await fetch(`${GQL_URL}?optype=query&opname=Autocomplete`, {
    method: "POST",
    headers: BASE_HEADERS,
    body: JSON.stringify({
      operationName: "Autocomplete",
      variables: {
        term: query,
        latitude: 40.758,
        longitude: -73.9855,
        useNewVersion: true,
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "3cabca79abcb0db395d3cbebb4d47d41f3ddd69442eba3a57f76b943cceb8cf4",
        },
      },
    }),
  })

  if (!res.ok) return []
  const data = await res.json()
  const results = data?.data?.autocomplete?.autocompleteResults ?? []
  return results
    .filter((r: { type?: string }) => r.type === "Restaurant")
    .map((r: { id?: number; name?: string; country?: string; metroName?: string; neighborhoodName?: string; cuisineList?: string[] }) => ({
      id: r.id ?? 0,
      name: r.name ?? "Unknown",
      neighborhood: r.neighborhoodName ?? r.metroName ?? "NYC",
      cuisine: r.cuisineList?.[0] ?? "",
      city: r.metroName ?? "New York",
    }))
}
