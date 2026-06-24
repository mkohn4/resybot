"use client"

import { useEffect, useRef, useCallback } from "react"
import { pickBestOTSlot, buildOTBookingPayload, type OTSlot } from "./opentable"

type WatchTarget = {
  id: string
  venueId: number
  date: Date
  partySize: number
  preferredTimes: string[]
  status: string
  platform: string
}

type OTProfile = {
  firstName: string
  lastName: string
  phone: string
  email: string
}

const OT_AVAIL_HASH = "e6b87021ed6e865a7778aa39d35d09864c1be29c683c707602dd3de43c854d86"
const OT_GQL = "https://www.opentable.com/dapi/fe/gql"

// Fetch OT availability from the browser (residential IP — datacenter IPs blocked by Akamai).
export async function fetchOTSlotsBrowser(
  venueId: number,
  date: string,
  partySize: number
): Promise<OTSlot[]> {
  const res = await fetch(`${OT_GQL}?optype=query&opname=RestaurantsAvailability`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "*/*",
      origin: "https://www.opentable.com",
      referer: "https://www.opentable.com/",
      "x-csrf-token": crypto.randomUUID(),
    },
    body: JSON.stringify({
      operationName: "RestaurantsAvailability",
      variables: {
        restaurantIds: [venueId],
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
        persistedQuery: { version: 1, sha256Hash: OT_AVAIL_HASH },
      },
    }),
  })
  if (!res.ok) return []
  const data = await res.json()
  const slots: OTSlot[] = []
  for (const venue of data?.data?.availability ?? []) {
    for (const day of venue.availabilityDays ?? []) {
      for (const slot of day.slots ?? []) {
        if (!slot.isAvailable) continue
        const offsetMins = slot.timeOffsetMinutes ?? 0
        const h = Math.floor(offsetMins / 60), m = offsetMins % 60
        slots.push({
          dateTime: `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
          slotHash: slot.slotHash,
          slotAvailabilityToken: slot.slotAvailabilityToken,
          timeOffsetMinutes: offsetMins,
        })
      }
    }
  }
  return slots
}

// Full browser-side OT booking flow:
// 1. Find available slots (browser → OT, residential IP)
// 2. POST booking directly to OT (browser → OT)
// 3. Record confirmed booking in our DB (browser → our server)
export async function bookOTFromBrowser(
  targetId: string,
  venueId: number,
  date: string,
  partySize: number,
  preferredTimes: string[],
  profile: OTProfile
): Promise<{ success: boolean; slot?: string; time?: string; fallbackToWatch?: boolean; message?: string }> {
  try {
    const slots = await fetchOTSlotsBrowser(venueId, date, partySize)
    const best = pickBestOTSlot(slots, preferredTimes)
    if (!best) {
      return { success: false, fallbackToWatch: true, message: "No slots in your preferred times right now" }
    }

    // POST booking directly from browser to OT
    const { url, body } = buildOTBookingPayload(venueId, best, partySize, {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
    })
    const bookRes = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        origin: "https://www.opentable.com",
        referer: "https://www.opentable.com/",
        "x-csrf-token": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    })
    if (!bookRes.ok) {
      const errText = await bookRes.text()
      return { success: false, message: `OT booking failed: ${bookRes.status} — ${errText}` }
    }
    const bookData = await bookRes.json()
    const reservationId = String(bookData?.reservationId ?? bookData?.id ?? "unknown")

    // Record in DB — server just saves, no OT calls
    const recordRes = await fetch(`/api/targets/${targetId}/ot-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: best, reservationId }),
    })
    return await recordRes.json()
  } catch (err: unknown) {
    return { success: false, message: err instanceof Error ? err.message : "OT booking failed" }
  }
}

// Polls OT every 60s from the browser for WATCHING OT targets.
// Only runs while the dashboard is open.
export function useOTWatcher(
  targets: WatchTarget[],
  profile: OTProfile | null,
  onBooked: (id: string, slot: string) => void
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkingRef = useRef(false)

  const checkAll = useCallback(async () => {
    if (checkingRef.current || !profile) return
    const watching = targets.filter(
      (t) => t.platform === "OPENTABLE" && t.status === "WATCHING"
    )
    if (watching.length === 0) return

    checkingRef.current = true
    try {
      await Promise.allSettled(
        watching.map(async (target) => {
          const dateStr = new Date(target.date).toISOString().split("T")[0]
          const result = await bookOTFromBrowser(
            target.id,
            target.venueId,
            dateStr,
            target.partySize,
            target.preferredTimes,
            profile
          )
          if (result.success && result.slot) {
            onBooked(target.id, result.slot)
          }
        })
      )
    } finally {
      checkingRef.current = false
    }
  }, [targets, profile, onBooked])

  useEffect(() => {
    checkAll()
    intervalRef.current = setInterval(checkAll, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [checkAll])
}
