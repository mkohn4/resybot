"use client"

import { useState } from "react"

const LUNCH_TIMES  = ["11:30", "11:45", "12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30"]
const DINNER_TIMES = ["17:30", "17:45", "18:00", "18:15", "18:30", "18:45", "19:00", "19:15", "19:30", "19:45", "20:00", "20:15", "20:30", "20:45", "21:00", "21:15", "21:30", "21:45", "22:00", "22:15", "22:30"]

function label12(t: string): string {
  const [h, m] = t.split(":").map(Number)
  if (isNaN(h) || isNaN(m)) return t
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
}

type Attempt = {
  id: string
  attemptAt: Date
  success: boolean
  error: string | null
  slot: string | null
}

type Target = {
  id: string
  venueId: number
  venueName: string
  neighborhood: string | null
  cuisine: string | null
  date: Date
  partySize: number
  preferredTimes: string[]
  snipeAt: Date
  status: string
  platform: string
  bookedSlot: string | null
  lastAttemptAt: Date | null
  notificationEmail: string | null
  attempts: Attempt[]
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-blue-500/20 text-blue-400",
  SNIPING: "bg-yellow-500/20 text-yellow-400 animate-pulse",
  WATCHING: "bg-amber-500/20 text-amber-400 animate-pulse",
  BOOKED: "bg-emerald-500/20 text-emerald-400",
  FAILED: "bg-red-500/20 text-red-400",
  CANCELLED: "bg-gray-500/20 text-gray-400",
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SNIPING: "Sniping…",
  WATCHING: "Watching…",
  BOOKED: "Booked!",
  FAILED: "Expired",
  CANCELLED: "Cancelled",
}

export function TargetCard({
  target,
  onDelete,
  onRefresh,
}: {
  target: Target
  onDelete: () => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sniping, setSniping] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [snipeResult, setSnipeResult] = useState<{ success: boolean; message?: string; slot?: string; fallbackToWatch?: boolean } | null>(null)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")
  const [editTimes, setEditTimes] = useState<string[]>(target.preferredTimes)
  const [editPartySize, setEditPartySize] = useState(target.partySize)

  function startEdit() {
    setEditTimes(target.preferredTimes)
    setEditPartySize(target.partySize)
    setEditError("")
    setEditing(true)
    setExpanded(false)
  }

  function toggleEditTime(t: string) {
    setEditTimes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  async function handleSaveEdit() {
    if (editTimes.length === 0) {
      setEditError("Select at least one preferred time")
      return
    }
    setSaving(true)
    setEditError("")
    try {
      const res = await fetch(`/api/targets/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferredTimes: editTimes, partySize: editPartySize }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setEditError(data.error ?? "Could not save changes")
        return
      }
      setEditing(false)
      onRefresh()
    } catch {
      setEditError("Could not save changes — try again")
    } finally {
      setSaving(false)
    }
  }

  // Deep-link to the venue page on the booking platform.
  // OpenTable has a clean by-id profile URL; Resy pages are slug-based (no public
  // by-id URL), so we deep-link to Resy search prefilled with name/date/party.
  const venueUrl = (() => {
    const dateStr = new Date(target.date).toISOString().split("T")[0]
    if (target.platform === "OPENTABLE") {
      const u = new URL(`https://www.opentable.com/restaurant/profile/${target.venueId}`)
      u.searchParams.set("dateTime", `${dateStr}T19:00`)
      u.searchParams.set("covers", String(target.partySize))
      return u.toString()
    }
    const u = new URL("https://resy.com/cities/new-york-ny")
    u.searchParams.set("date", dateStr)
    u.searchParams.set("seats", String(target.partySize))
    u.searchParams.set("query", target.venueName)
    return u.toString()
  })()

  const reservationDate = new Date(target.date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  const snipeDate = new Date(target.snipeAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  })

  const bookedTime = target.bookedSlot
    ? (() => {
        // Resy: "2026-07-10 20:00:00", OT: "2026-07-10T20:00"
        const t = (target.bookedSlot.split("T")[1] ?? target.bookedSlot.split(" ")[1] ?? "").substring(0, 5)
        const [h, m] = t.split(":").map(Number)
        if (isNaN(h) || isNaN(m)) return null
        return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
      })()
    : null

  async function handleDelete() {
    setDeleting(true)
    await onDelete()
  }

  async function handleStopWatching() {
    setStopping(true)
    try {
      const res = await fetch(`/api/targets/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      })
      if (!res.ok) {
        setSnipeResult({ success: false, message: "Could not stop watching — try again" })
        return
      }
      onRefresh()
    } catch {
      setSnipeResult({ success: false, message: "Could not stop watching — try again" })
    } finally {
      setStopping(false)
    }
  }

  async function handleTryNow() {
    setSniping(true)
    setSnipeResult(null)
    try {
      const res = await fetch(`/api/targets/${target.id}/snipe`, { method: "POST" })
      const data = await res.json()
      setSnipeResult(data)
      if (data.success) onRefresh()
    } catch {
      setSnipeResult({ success: false, message: "Request failed" })
    } finally {
      setSniping(false)
    }
  }

  return (
    <div className={`bg-gray-900 rounded-xl border transition-colors ${
      target.status === "BOOKED" ? "border-emerald-500/40" : "border-gray-800"
    }`}>
      <div className="p-4 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <a
              href={venueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white font-semibold text-sm hover:text-emerald-400 transition-colors hover:underline decoration-emerald-400/40 underline-offset-2"
              title={`Open ${target.venueName} on ${target.platform === "OPENTABLE" ? "OpenTable" : "Resy"}`}
            >
              {target.venueName}
            </a>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[target.status] ?? "bg-gray-700 text-gray-400"}`}>
              {STATUS_LABELS[target.status] ?? target.status}
            </span>
            {target.platform === "OPENTABLE" && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/20 text-blue-400">OT</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
            {target.neighborhood && <span>{target.neighborhood}</span>}
            <span>{reservationDate}</span>
            <span>Party of {target.partySize}</span>
          </div>
          {target.status === "BOOKED" && bookedTime && (
            <p className="text-emerald-400 text-xs font-medium mt-1">Reserved at {bookedTime} ✓</p>
          )}
          {target.status === "WATCHING" && (
            <p className="text-amber-400/70 text-xs mt-1">Checking every minute for cancellations until {reservationDate}</p>
          )}
          {target.status !== "BOOKED" && target.status !== "WATCHING" && (
            <p className="text-gray-500 text-xs mt-1">Snipes at {snipeDate}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs py-1.5 px-2"
          >
            {expanded ? "Less" : "Details"}
          </button>
          {["PENDING", "SNIPING", "WATCHING"].includes(target.status) && (
            <button
              onClick={() => (editing ? setEditing(false) : startEdit())}
              className="text-xs bg-gray-700/40 hover:bg-gray-700 text-gray-300 px-2.5 py-1 rounded-lg transition-colors"
            >
              {editing ? "Close" : "Edit"}
            </button>
          )}
          {target.status === "WATCHING" && (
            <button
              onClick={handleStopWatching}
              disabled={stopping}
              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
            >
              {stopping ? "Stopping…" : "Stop"}
            </button>
          )}
          {(target.status === "PENDING" || target.status === "SNIPING") && (
            <button
              onClick={handleTryNow}
              disabled={sniping || target.status === "SNIPING"}
              className="text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
            >
              {sniping ? "Trying…" : "Try Now"}
            </button>
          )}
          {target.status !== "BOOKED" && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-gray-600 hover:text-red-400 transition-colors text-xs py-1.5 px-2"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {snipeResult && (
        <div className={`px-4 py-2.5 border-t text-xs font-medium ${
          snipeResult.success
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
            : "border-red-500/30 bg-red-500/10 text-red-400"
        }`}>
          {snipeResult.success
            ? `Booked! ${snipeResult.slot ? (() => { const t = (snipeResult.slot!.split("T")[1] ?? snipeResult.slot!.split(" ")[1] ?? "").substring(0,5); const [h,m] = t.split(":").map(Number); return isNaN(h)||isNaN(m) ? "" : `${h===0?12:h>12?h-12:h}:${m.toString().padStart(2,"0")}${h>=12?"pm":"am"}` })() : ""}`
            : snipeResult.fallbackToWatch
            ? "No slots now — switched to Watch mode for cancellations"
            : `No slots available: ${snipeResult.message}`
          }
        </div>
      )}

      {editing && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-4">
          {/* Party size */}
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1.5">Party Size</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setEditPartySize(n)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    editPartySize === n ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred times */}
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1.5">Preferred Times</p>
            {[{ label: "Lunch", times: LUNCH_TIMES }, { label: "Dinner", times: DINNER_TIMES }].map(({ label, times }) => (
              <div key={label} className="mb-2">
                <p className="text-xs text-gray-600 uppercase tracking-wider mb-1.5">{label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {times.map((t) => (
                    <button
                      key={t}
                      onClick={() => toggleEditTime(t)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        editTimes.includes(t) ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {label12(t)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-gray-500 text-xs mt-1">Times are tried in the order shown when you first added them. Newly added times are appended.</p>
          </div>

          {editError && <p className="text-red-400 text-xs">{editError}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2 rounded-lg transition-colors text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving || editTimes.length === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors text-xs"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-3">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1.5">Preferred Times</p>
            <div className="flex flex-wrap gap-1.5">
              {target.preferredTimes.map((t) => {
                const [h, m] = t.split(":").map(Number)
                const label = isNaN(h) || isNaN(m) ? t : `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
                return (
                  <span key={t} className="bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded">
                    {label}
                  </span>
                )
              })}
            </div>
          </div>
          {target.attempts.length > 0 && (
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1.5">Recent Attempts</p>
              <div className="space-y-1">
                {target.attempts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <span>{a.success ? "✅" : "❌"}</span>
                    <span className="text-gray-400">
                      {new Date(a.attemptAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {a.error && <span className="text-red-400 break-words line-clamp-2">{a.error}</span>}
                    {a.slot && <span className="text-emerald-400">{a.slot}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {target.notificationEmail && (
            <p className="text-gray-500 text-xs">Notify: {target.notificationEmail}</p>
          )}
        </div>
      )}
    </div>
  )
}
