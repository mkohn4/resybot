"use client"

import { useState, useEffect, useRef } from "react"
import type { Restaurant } from "@/lib/restaurants"
import { suggestSnipeTime } from "@/lib/restaurants"

const PREFERRED_TIMES = ["18:30", "18:45", "19:00", "19:15", "19:30", "19:45", "20:00", "20:15", "20:30", "20:45", "21:00"]
const DEFAULT_TIMES = ["19:30", "19:45", "20:00", "20:15", "20:30", "20:45", "21:00"]

export function AddTargetModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (target: unknown) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Restaurant[]>([])
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
  const searchRef = useRef<HTMLDivElement>(null)

  // Search curated list
  useEffect(() => {
    if (query.length < 2 || useCustom) { setResults([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/venues/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data)
      setShowDropdown(true)
    }, 200)
    return () => clearTimeout(timer)
  }, [query, useCustom])

  // Auto-suggest snipe time when date + restaurant selected
  useEffect(() => {
    if (!date || !selected) return
    const suggested = suggestSnipeTime(selected, new Date(date + "T12:00:00"))
    if (suggested) {
      // Format as local datetime-local input value
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
    if (!venueId || !venueName || !date || !snipeAt) {
      setError("Please fill in all required fields")
      return
    }
    if (preferredTimes.length === 0) {
      setError("Select at least one preferred time")
      return
    }
    setLoading(true)
    setError("")
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
          snipeAt: new Date(snipeAt).toISOString(),
          notificationEmail: notificationEmail || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to add target")
      onAdded(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split("T")[0]

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-lg shadow-2xl my-4">
        <h2 className="text-lg font-bold text-white mb-5">Add Reservation Target</h2>

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

        {/* Suggestions */}
        {selected && selected.releaseTime && (
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
            min={minDate}
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
                  partySize === n
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred times */}
        <div className="mb-4">
          <label className="text-sm text-gray-400 mb-1.5 block">Preferred Times (select all acceptable)</label>
          <div className="flex flex-wrap gap-2">
            {PREFERRED_TIMES.map((t) => {
              const [h, m] = t.split(":").map(Number)
              const label = `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
              return (
                <button
                  key={t}
                  onClick={() => toggleTime(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    preferredTimes.includes(t)
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Snipe time */}
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
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Adding…" : "Add Target"}
          </button>
        </div>
      </div>
    </div>
  )
}
