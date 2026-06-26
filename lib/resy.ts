export const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"

const BASE_HEADERS = {
  origin: "https://resy.com",
  "x-origin": "https://resy.com",
  "accept-language": "en-US,en;q=0.9",
  authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
  "content-type": "application/x-www-form-urlencoded",
  accept: "application/json, text/plain, */*",
  referer: "https://resy.com/",
  authority: "api.resy.com",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

export type ResySlot = {
  date: { start: string }
  config: { token: string; type: string }
}

export type ResyAuthResult = {
  token: string
  paymentMethodId: string | null
}

export async function resyLogin(email: string, password: string): Promise<ResyAuthResult> {
  const body = new URLSearchParams({ email, password })
  const res = await fetch("https://api.resy.com/3/auth/password", {
    method: "POST",
    headers: BASE_HEADERS,
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`Resy login failed: ${res.status}`)
  const data = await res.json()
  if (!data.token) throw new Error("Invalid credentials — no token returned")
  return {
    token: data.token,
    paymentMethodId: data.payment_method_id ? String(data.payment_method_id) : null,
  }
}

export async function findSlots(
  venueId: number,
  date: string,
  partySize: number,
  authToken: string
): Promise<ResySlot[]> {
  const params = new URLSearchParams({
    "x-resy-auth-token": authToken,
    day: date,
    lat: "0",
    long: "0",
    party_size: String(partySize),
    venue_id: String(venueId),
  })
  const res = await fetch(`https://api.resy.com/4/find?${params}`, {
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(3000),
  })
  if (!res.ok) throw new Error(`findSlots failed: ${res.status}`)
  const data = await res.json()
  const venues = data?.results?.venues
  if (!venues?.length) return []
  return venues[0]?.slots ?? []
}

export function pickBestSlot(
  slots: ResySlot[],
  preferredTimes: string[], // ["19:30", "19:45", ...]
  date: string
): ResySlot | null {
  const isPatio = (slot: ResySlot) => {
    const t = slot.config.type?.toLowerCase() ?? ""
    return t.includes("patio") || t.includes("outside") || t.includes("outdoor")
  }

  // Build a map of time -> slot. If multiple slots share a time, prefer a
  // non-patio slot so a later patio entry doesn't mask a bookable indoor one.
  const slotByTime: Record<string, ResySlot> = {}
  for (const slot of slots) {
    const start = slot.date.start // "2024-03-15 19:30:00"
    const time = start.split(" ")[1]?.substring(0, 5) // "19:30"
    if (!time) continue
    const existing = slotByTime[time]
    if (!existing || (isPatio(existing) && !isPatio(slot))) {
      slotByTime[time] = slot
    }
  }

  // Return first preferred time that has a non-patio slot
  for (const t of preferredTimes) {
    const slot = slotByTime[t]
    if (!slot || isPatio(slot)) continue
    return slot
  }

  return null
}

export async function bookSlot(
  authToken: string,
  paymentMethodId: string,
  configToken: string,
  date: string,
  partySize: number
): Promise<{ reservationId: string }> {
  const detailParams = new URLSearchParams({
    "x-resy-auth-token": authToken,
    config_id: configToken,
    day: date,
    party_size: String(partySize),
  })
  const detailRes = await fetch(`https://api.resy.com/3/details?${detailParams}`, {
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(5000),
  })
  if (!detailRes.ok) throw new Error(`getDetails failed: ${detailRes.status}`)
  const details = await detailRes.json()
  const bookToken = details?.book_token?.value
  if (!bookToken) throw new Error("No book_token in details response")

  const bookBody = new URLSearchParams({
    book_token: bookToken,
    struct_payment_method: JSON.stringify({ id: Number(paymentMethodId) }),
    source_id: "resy.com-venue-details",
  })
  const bookRes = await fetch("https://api.resy.com/3/book", {
    method: "POST",
    headers: { ...BASE_HEADERS, "x-resy-auth-token": authToken },
    body: bookBody.toString(),
    signal: AbortSignal.timeout(5000),
  })
  if (!bookRes.ok) {
    const errText = await bookRes.text()
    throw new Error(`booking failed: ${bookRes.status} — ${errText}`)
  }
  const bookData = await bookRes.json()
  return { reservationId: bookData.reservation_id ?? bookData.id ?? "unknown" }
}
