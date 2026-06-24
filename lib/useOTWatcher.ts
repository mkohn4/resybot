"use client"

import { useEffect, useRef, useCallback } from "react"
import { pickBestOTSlot } from "./opentable"

type WatchTarget = {
  id: string
  venueId: number
  date: Date
  partySize: number
  preferredTimes: string[]
  status: string
  platform: string
}

// Polls OpenTable availability from the browser (residential IP — avoids datacenter blocks).
// Calls /api/targets/[id]/ot-book when a slot is found.
// Only active while the page is open.
export function useOTWatcher(
  targets: WatchTarget[],
  onBooked: (id: string, slot: string) => void
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkingRef = useRef(false)

  const checkAll = useCallback(async () => {
    if (checkingRef.current) return
    const watching = targets.filter(
      (t) => t.platform === "OPENTABLE" && t.status === "WATCHING"
    )
    if (watching.length === 0) return

    checkingRef.current = true
    try {
      await Promise.allSettled(watching.map(async (target) => {
        const dateStr = new Date(target.date).toISOString().split("T")[0]
        try {
          // Fetch OT availability directly from browser (residential IP)
          const res = await fetch(
            `https://www.opentable.com/dapi/fe/gql?optype=query&opname=RestaurantsAvailability`,
            {
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
                  restaurantIds: [target.venueId],
                  date: dateStr,
                  time: "19:00",
                  partySize: target.partySize,
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
            }
          )
          if (!res.ok) return

          const data = await res.json()
          const slots: { dateTime: string; slotHash: string; slotAvailabilityToken: string; timeOffsetMinutes: number }[] = []
          const availability = data?.data?.availability ?? []
          for (const venue of availability) {
            for (const day of venue.availabilityDays ?? []) {
              for (const slot of day.slots ?? []) {
                if (!slot.isAvailable) continue
                const offsetMins = slot.timeOffsetMinutes ?? 0
                const h = Math.floor(offsetMins / 60)
                const m = offsetMins % 60
                const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
                slots.push({
                  dateTime: `${dateStr}T${timeStr}`,
                  slotHash: slot.slotHash,
                  slotAvailabilityToken: slot.slotAvailabilityToken,
                  timeOffsetMinutes: offsetMins,
                })
              }
            }
          }

          const best = pickBestOTSlot(slots, target.preferredTimes)
          if (!best) return

          // Found a slot — tell the server to book it
          const bookRes = await fetch(`/api/targets/${target.id}/ot-book`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slot: best }),
          })
          const bookData = await bookRes.json()
          if (bookData.success) {
            onBooked(target.id, bookData.slot)
          }
        } catch {
          // Silent — will retry next tick
        }
      }))
    } finally {
      checkingRef.current = false
    }
  }, [targets, onBooked])

  useEffect(() => {
    // Check immediately on mount, then every 60s
    checkAll()
    intervalRef.current = setInterval(checkAll, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [checkAll])
}
