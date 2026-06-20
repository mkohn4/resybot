"use client"

import { useState, useEffect, useRef } from "react"
import type { Restaurant } from "@/lib/restaurants"
import { suggestSnipeTime } from "@/lib/restaurants"

type VenueResult = Restaurant & { source?: "curated" | "resy" }

const PREFERRED_TIMES = ["18:30", "18:45", "19:00", "19:15", "19:30", "19:45", "20:00", "20:15", "20:30", "20:45", "21:00"]
const DEFAULT_TIMES = ["19:30", "19:45", "20:00", "20:15", "20:30", "20:45", "21:00"]

type Mode = "scheduled" | "now" | "watch"

export function AddTargetModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (target: unknown) => void
}) {
  const [mode, setMode] = useState<Mode>("scheduled")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<VenueResult[]>([])
  const [selected, setSelected] = useState<Restaurant | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [customVenueId, setCustomVenueId] = useState("")
  const [customName, setCustomName] = useState("")
  const [useCustom, setUseCustom] = useState(false)

  const [date, setDate] = useState("")
  const [partySize, setPartySize] = useState(2)
  const [preferredTimes, setPreferredTimes] = useState<string[]>(DEFAULT_TIMES)
  const [snipeAt, setSnipeAt] = useState("")
  const [notificationEmail, setNotificationEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [nowResult, setNowResult] = useState<{ success: boolean; message?: string; slot?: string } | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2 || useCustom) { setResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/venues/lookup?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results ?? [])
      setShowDropdown(true)
    }, 200)
    return () => clearTimeout(timer)
  }, [query, useCustom])

  useEffect(() => {
    if (!date || !selected) return
    const suggested = suggestSnipeTime(selected, new Date(date + "T12:00:00"))
    if (suggested) {
      const localISO = new Date(suggested.getTime() - suggested.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setSnipeAt(localISO)
    }
  }, [date, selected])

  function selectRestaurant(r: Restaurant) {
    setSelected(r)
    setQuery(r.name)
    setShowDropdown(false)
    setResults([])
  }

  function toggleTime(t: string) {
    setPreferredTimes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort()
    )
  }

  async function handleSubmit() {
    const venueId = useCustom ? customVenueId : selected?.venueId
    const venueName = useCustom ? customName : selected?.name
    if (!venueId || !venueName || !date) {
      setError("Please fill in restaurant and date")
      return
    }
    if (mode === "scheduled" && !snipeAt) {
      setError("Please set a snipe time")
      return
    }
    if (mode === "watch" && !date) {
      setError("Please set the reservation date to watch for")
      return
    }
    if (preferredTimes.length === 0) {
      setError("Select at least one preferred time")
      return
    }
    setLoading(true)
    setError("")
    setNowResult(null)

    const snipeTime = mode === "now" || mode === "watch"
      ? new Date().toISOString()
      : new Date(snipeAt).toISOString()

    try {
      const res = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: Number(venueId),
          venueName,
          neighborhood: selected?.neighborhood ?? null,
          cuisine: selected?.cuisine ?? null,
          date: new Date(date + "T12:00:00").toISOString(),
          partySize,
          preferredTimes,
          snipeAt: snipeTime,
          mode: mode === "watch" ? "WATCH" : "SNIPE",
          notificationEmail: notificationEmail || undefined,
        }),
      })
      const target = await res.json()
      if (!res.ok) throw new Error(target.error ?? "Failed to add target")

      if (mode === "now") {
        const snipeRes = await fetch(`/api/targets/${target.id}/snipe`, { method: "POST" })
        const snipeData = await snipeRes.json()
        setNowResult(snipeData)
        if (snipeData.success) {
          onAdded({ ...target, status: "BOOKED", bookedSlot: snipeData.slot })
        } else {
          onAdded({ ...target, status: "PENDING" })
        }
      } else {
        onAdded(target)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split("T")[0]

  // If "now" mode succeeded/failed, show result instead of form
  if (nowResult) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 w-full max-w-md shadow-2xl text-center">
          {nowResult.success ? (
            <>
              <div className="text-5xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-white mb-2">Reservation Booked!</h2>
              <p className="text-gray-400 text-sm mb-1">
                {useCustom ? customName : selected?.name}
              </p>
              {nowResult.slot && (
                <p className="text-emerald-400 font-semibold mt-1">
                  {(() => {
                    const t = nowResult.slot!.split(" ")[1]?.substring(0, 5) ?? ""
                    const [h, m] = t.split(":").map(Number)
                    return `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
                  })()}
                </p>
              )}
              <p className="text-gray-500 text-xs mt-3">Check your Resy app for confirmation details</p>
            </>
          ) : (
            <>
              <div className="text-5xl mb-4">😔</div>
              <h2 className="text-xl font-bold text-white mb-2">No slots available</h2>
              <p className="text-gray-400 text-sm">{nowResult.message}</p>
              <p className="text-gray-500 text-xs mt-3">The target was saved — switch it to Scheduled mode to snipe when reservations open</p>
            </>
          )}
          <button
            onClick={onClose}
            className="mt-6 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-lg shadow-2xl my-4">
        <h2 className="text-lg font-bold text-white mb-5">Add Reservation Target</h2>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-5 bg-gray-800 p-1 rounded-xl">
          <button
            onClick={() => setMode("scheduled")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              mode === "scheduled" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Scheduled
          </button>
          <button
            onClick={() => setMode("now")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              mode === "now" ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Book Now
          </button>
          <button
            onClick={() => setMode("watch")}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              mode === "watch" ? "bg-amber-600 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Watch
          </button>
        </div>

        {mode === "scheduled" && (
          <p className="text-gray-500 text-xs mb-4 -mt-2">
            Bot wakes up at your chosen time and snipes the moment reservations open.
          </p>
        )}
        {mode === "now" && (
          <p className="text-gray-500 text-xs mb-4 -mt-2">
            Immediately checks for available slots and books one right now.
          </p>
        )}
        {mode === "watch" && (
          <p className="text-amber-400/70 text-xs mb-4 -mt-2">
            Polls every minute for cancellations. Books instantly when a slot in your preferred time range opens up.
          </p>
        )}

        {/* Restaurant search */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-1.5 block">Restaurant</label>
          {!useCustom ? (
            <div className="relative" ref={searchRef}>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
                onFocus={() => results.length > 0 && setShowDropdown(true)}
                placeholder="Search NYC restaurants…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
              />
              {showDropdown && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                  {results.map((r) => (
                    <button
                      key={r.venueId ?? r.name}
                      onClick={() => selectRestaurant(r)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white text-sm font-medium">{r.name}</p>
                          <p className="text-gray-400 text-xs">{r.neighborhood} · {r.cuisine}</p>
                        </div>
                        <span className="text-gray-500 text-xs">{r.priceRange}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={customVenueId}
                onChange={(e) => setCustomVenueId(e.target.value)}
                placeholder="Resy Venue ID (number)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
              />
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Restaurant name"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
          )}
          <button
            onClick={() => { setUseCustom(!useCustom); setSelected(null); setQuery(""); setCustomVenueId(""); setCustomName("") }}
            className="text-xs text-emerald-400 hover:text-emerald-300 mt-2 transition-colors"
          >
            {useCustom ? "← Search curated list" : "Enter venue ID manually →"}
          </button>
        </div>

        {selected?.releaseTime && (
          <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
            <p className="text-blue-300 text-xs font-medium mb-0.5">Release info for {selected.name}</p>
            <p className="text-blue-200/70 text-xs">{selected.releaseNotes}</p>
          </div>
        )}

        {/* Date */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-1.5 block">Reservation Date</label>
          <input
            type="date"
            value={date}
            min={mode === "now" ? new Date().toISOString().split("T")[0] : minDate}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        {/* Party size */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-1.5 block">Party Size</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setPartySize(n)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  partySize === n ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred times */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-1.5 block">Preferred Times</label>
          <div className="flex flex-wrap gap-2">
            {PREFERRED_TIMES.map((t) => {
              const [h, m] = t.split(":").map(Number)
              const label = `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
              return (
                <button
                  key={t}
                  onClick={() => toggleTime(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    preferredTimes.includes(t) ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Snipe time — only for scheduled mode */}
        {mode === "scheduled" && (
          <div className="mb-4">
            <label className="text-sm text-gray-400 mb-1.5 block">
              Snipe At
              {snipeAt && selected?.releaseTime && (
                <span className="ml-2 text-emerald-400 text-xs">(auto-suggested)</span>
              )}
            </label>
            <input
              type="datetime-local"
              value={snipeAt}
              onChange={(e) => setSnipeAt(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm"
            />
            <p className="text-gray-500 text-xs mt-1">The exact moment the bot will start trying to snipe</p>
          </div>
        )}

        {/* Notification email */}
        <div className="mb-5">
          <label className="text-sm text-gray-400 mb-1.5 block">Notification Email (optional)</label>
          <input
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder="Defaults to your account email"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`flex-1 font-semibold py-2.5 rounded-lg transition-colors text-sm disabled:opacity-50 ${
              mode === "now" ? "bg-emerald-600 hover:bg-emerald-500 text-white"
              : mode === "watch" ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {loading
              ? mode === "now" ? "Booking…" : mode === "watch" ? "Starting…" : "Scheduling…"
              : mode === "now" ? "Book Now" : mode === "watch" ? "Start Watching" : "Schedule Snipe"
            }
          </button>
        </div>
      </div>
    </div>
  )
}
