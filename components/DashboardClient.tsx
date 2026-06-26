"use client"

import { useState, useRef, useEffect } from "react"
import { signOut } from "next-auth/react"
import Link from "next/link"
import { AddTargetModal } from "./AddTargetModal"
import { CredentialsModal } from "./CredentialsModal"
import { OTProfileModal } from "./OTProfileModal"
import { TargetCard } from "./TargetCard"
import { ThemeToggle } from "./ThemeToggle"

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
  attempts: { id: string; attemptAt: Date; success: boolean; error: string | null; slot: string | null }[]
}

type Props = {
  user: { name: string; email: string; image: string }
  initialTargets: Target[]
  hasCredentials: boolean
  hasOTProfile: boolean
}

export function DashboardClient({ user, initialTargets, hasCredentials, hasOTProfile }: Props) {
  const [targets, setTargets] = useState<Target[]>(initialTargets)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCredModal, setShowCredModal] = useState(!hasCredentials)
  const [showOTModal, setShowOTModal] = useState(false)
  const [credsSaved, setCredsSaved] = useState(hasCredentials)
  const [otProfileSaved, setOTProfileSaved] = useState(hasOTProfile)

  async function refreshTargets() {
    const res = await fetch("/api/targets")
    const data = await res.json()
    setTargets(data)
  }

  async function deleteTarget(id: string) {
    await fetch(`/api/targets/${id}`, { method: "DELETE" })
    setTargets((prev) => prev.filter((t) => t.id !== id))
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuOpen])

  const [bookedCollapsed, setBookedCollapsed] = useState(false)
  const [expiredCollapsed, setExpiredCollapsed] = useState(true)

  const activeTargets = targets.filter((t) => ["PENDING", "SNIPING", "WATCHING"].includes(t.status))
  const bookedTargets = targets.filter((t) => t.status === "BOOKED")
  const expiredTargets = targets.filter((t) => ["FAILED", "CANCELLED"].includes(t.status))
  const pendingCount = activeTargets.length
  const bookedCount = bookedTargets.length

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight">ResyBot</h1>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">NYC</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden ring-2 ring-transparent hover:ring-gray-600 transition-all focus:outline-none"
                aria-label="Account menu"
              >
                {user.image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={user.image} alt={user.name} className="w-8 h-8 rounded-full" />
                  : <span className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 text-sm font-medium">{user.name?.[0] ?? "?"}</span>
                }
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800">
                    <p className="text-white text-sm font-medium truncate">{user.name}</p>
                    <p className="text-gray-500 text-xs truncate">{user.email}</p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => { setShowCredModal(true); setMenuOpen(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center justify-between"
                    >
                      <span>Connect Resy</span>
                      {credsSaved && <span className="text-emerald-400 text-xs">✓</span>}
                    </button>
                    <button
                      onClick={() => { setShowOTModal(true); setMenuOpen(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center justify-between"
                    >
                      <span>Connect OpenTable</span>
                      {otProfileSaved && <span className="text-emerald-400 text-xs">✓</span>}
                    </button>
                    <Link
                      href="/dashboard/lookup"
                      onClick={() => setMenuOpen(false)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors flex items-center gap-2 block"
                    >
                      Venue Lookup
                    </Link>
                  </div>
                  <div className="border-t border-gray-800 py-1">
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-gray-800 hover:text-red-300 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Credential warning */}
        {!credsSaved && !otProfileSaved && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-amber-400 font-medium text-sm">Connect your Resy account to start sniping</p>
              <p className="text-amber-400/70 text-xs mt-0.5">Your credentials are encrypted and stored securely</p>
            </div>
            <button
              onClick={() => setShowCredModal(true)}
              className="bg-amber-500 text-black font-semibold text-sm px-4 py-2 rounded-lg hover:bg-amber-400 transition-colors"
            >
              Connect
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8">
          <div className="bg-gray-900 rounded-xl p-3 sm:p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Active</p>
            <p className="text-2xl font-bold text-white">{pendingCount}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-3 sm:p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Booked</p>
            <p className="text-2xl font-bold text-emerald-400">{bookedCount}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-3 sm:p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Total</p>
            <p className="text-2xl font-bold text-white">{targets.length}</p>
          </div>
        </div>

        {/* Targets header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Reservation Targets</h2>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!credsSaved && !otProfileSaved}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Add Target
          </button>
        </div>

        {/* Active targets */}
        {activeTargets.length === 0 && bookedTargets.length === 0 && expiredTargets.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <p className="text-4xl mb-3">🍽️</p>
            <p className="text-lg font-medium text-gray-400">No targets yet</p>
            <p className="text-sm mt-1">Add a restaurant and we&apos;ll snipe the reservation the moment it opens</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTargets.map((t) => (
              <TargetCard key={t.id} target={t} onDelete={() => deleteTarget(t.id)} onRefresh={refreshTargets} />
            ))}
          </div>
        )}

        {/* Expired / failed section */}
        {expiredTargets.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setExpiredCollapsed(!expiredCollapsed)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors mb-3"
            >
              <span className={`transition-transform duration-200 ${expiredCollapsed ? "-rotate-90" : ""}`}>▾</span>
              <span>Expired</span>
              <span className="bg-gray-500/20 text-gray-400 text-xs px-2 py-0.5 rounded-full font-medium">
                {expiredTargets.length}
              </span>
            </button>
            {!expiredCollapsed && (
              <div className="space-y-3">
                {expiredTargets.map((t) => (
                  <TargetCard key={t.id} target={t} onDelete={() => deleteTarget(t.id)} onRefresh={refreshTargets} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Booked section */}
        {bookedTargets.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setBookedCollapsed(!bookedCollapsed)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-white transition-colors mb-3 group"
            >
              <span className={`transition-transform duration-200 ${bookedCollapsed ? "-rotate-90" : ""}`}>▾</span>
              <span>Booked</span>
              <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-medium">
                {bookedTargets.length}
              </span>
            </button>
            {!bookedCollapsed && (
              <div className="space-y-3">
                {bookedTargets.map((t) => (
                  <TargetCard key={t.id} target={t} onDelete={() => deleteTarget(t.id)} onRefresh={refreshTargets} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {showAddModal && (
        <AddTargetModal
          onClose={() => setShowAddModal(false)}
          onAdded={(t) => {
            setTargets((prev) => [t as Target, ...prev])
            setShowAddModal(false)
          }}
        />
      )}

      {showCredModal && (
        <CredentialsModal
          onClose={() => setShowCredModal(false)}
          onSaved={() => {
            setCredsSaved(true)
            setShowCredModal(false)
          }}
        />
      )}

      {showOTModal && (
        <OTProfileModal
          onClose={() => setShowOTModal(false)}
          onSaved={() => {
            setOTProfileSaved(true)
            setShowOTModal(false)
          }}
        />
      )}
    </div>
  )
}
