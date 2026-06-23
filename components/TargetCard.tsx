"use client"

import { useState } from "react"

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
  FAILED: "Failed",
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
  const [snipeResult, setSnipeResult] = useState<{ success: boolean; message?: string; slot?: string; fallbackToWatch?: boolean } | null>(null)

  const reservationDate = new Date(target.date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  const snipeDate = new Date(target.snipeAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })

  const bookedTime = target.bookedSlot
    ? (() => {
        const t = target.bookedSlot.split(" ")[1]?.substring(0, 5) ?? ""
        const [h, m] = t.split(":").map(Number)
        return `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
      })()
    : null

  async function handleDelete() {
    setDeleting(true)
    await onDelete()
  }

  async function handleStopWatching() {
    await fetch(`/api/targets/${target.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    })
    onRefresh()
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
            <h3 className="text-white font-semibold text-sm">{target.venueName}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[target.status] ?? "bg-gray-700 text-gray-400"}`}>
              {STATUS_LABELS[target.status] ?? target.status}
            </span>
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
          {target.status === "WATCHING" && (
            <button
              onClick={handleStopWatching}
              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 px-2.5 py-1 rounded-lg transition-colors"
            >
              Stop
            </button>
          )}
          {target.status !== "BOOKED" && target.status !== "WATCHING" && (
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
            ? `Booked! ${snipeResult.slot ? (() => { const t = snipeResult.slot!.split(" ")[1]?.substring(0,5) ?? ""; const [h,m] = t.split(":").map(Number); return `${h>12?h-12:h}:${m.toString().padStart(2,"0")}${h>=12?"pm":"am"}` })() : ""}`
            : snipeResult.fallbackToWatch
            ? "No slots now — switched to Watch mode for cancellations"
            : `No slots available: ${snipeResult.message}`
          }
        </div>
      )}

      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-3">
          <div>
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1.5">Preferred Times</p>
            <div className="flex flex-wrap gap-1.5">
              {target.preferredTimes.map((t) => {
                const [h, m] = t.split(":").map(Number)
                const label = `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
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
