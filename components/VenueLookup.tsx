"use client"

import { useState } from "react"
import Link from "next/link"
import { NYC_RESTAURANTS, type Restaurant } from "@/lib/restaurants"

type VenueResult = {
  venueId: number | null
  name: string
  neighborhood: string
  cuisine: string
  priceRange: string
  daysOut: number | null
  releaseTime: string | null
  releaseNotes: string
  source: "curated" | "resy" | "opentable"
  platform?: "resy" | "opentable"
}

function formatReleaseTime(r: { releaseTime: string | null; daysOut: number | null }) {
  if (!r.releaseTime || !r.daysOut) return null
  const [h, m] = r.releaseTime.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${r.daysOut} days out · ${h12}:${m.toString().padStart(2, "0")}${ampm} ET`
}

// Group curated list by neighborhood for the sidebar
const BY_NEIGHBORHOOD = NYC_RESTAURANTS.reduce<Record<string, Restaurant[]>>((acc, r) => {
  const hood = r.neighborhood
  if (!acc[hood]) acc[hood] = []
  acc[hood].push(r)
  return acc
}, {})

export function VenueLookup() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<VenueResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [copied, setCopied] = useState<number | string | null>(null)

  async function search(overrideQuery?: string) {
    const q = overrideQuery ?? query
    if (q.trim().length < 2) return
    if (overrideQuery) setQuery(overrideQuery)
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/venues/lookup?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } finally {
      setLoading(false)
    }
  }

  function selectFromSidebar(r: Restaurant) {
    setQuery(r.name)
    setResults([{
      venueId: r.venueId,
      name: r.name,
      neighborhood: r.neighborhood,
      cuisine: r.cuisine,
      priceRange: r.priceRange,
      daysOut: r.daysOut,
      releaseTime: r.releaseTime,
      releaseNotes: r.releaseNotes,
      source: "curated",
    }])
    setSearched(true)
  }

  function copyText(val: string | number) {
    navigator.clipboard.writeText(String(val))
    setCopied(val)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold text-white">Venue ID Lookup</h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 flex gap-6">

        {/* Left: search + results */}
        <main className="flex-1 min-w-0">
          <p className="text-gray-400 text-sm mb-5">
            Search any Resy restaurant to find its venue ID, or click a restaurant from the curated list on the right.
          </p>

          {/* Search bar */}
          <div className="flex gap-2 mb-6">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="Search by name, neighborhood, cuisine…"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
            />
            <button
              onClick={() => search()}
              disabled={loading || query.trim().length < 2}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm shrink-0"
            >
              {loading ? "…" : "Search"}
            </button>
          </div>

          {/* Results */}
          {searched && !loading && results.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>No results for &quot;{query}&quot;</p>
              <p className="text-xs mt-1">Try a different spelling or select from the curated list</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r, i) => (
                <div
                  key={`${r.venueId ?? r.name}-${i}`}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-white font-semibold">{r.name}</h3>
                        {r.source === "curated" && (
                          <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                            curated
                          </span>
                        )}
                        {(r.source === "opentable" || r.platform === "opentable") && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                            OpenTable
                          </span>
                        )}
                        {r.priceRange && <span className="text-gray-500 text-xs">{r.priceRange}</span>}
                      </div>
                      <p className="text-gray-400 text-xs mb-2">
                        {r.neighborhood}{r.cuisine ? ` · ${r.cuisine}` : ""}
                      </p>
                      {formatReleaseTime(r) && (
                        <p className="text-blue-300 text-xs mb-1">
                          Drops: {formatReleaseTime(r)}
                        </p>
                      )}
                      {r.releaseNotes && r.source === "curated" && (
                        <p className="text-gray-500 text-xs">{r.releaseNotes}</p>
                      )}
                      {(r.source === "resy" || r.source === "opentable") && !r.releaseTime && (
                        <p className="text-amber-400/70 text-xs">No release time data — set snipe time manually</p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      {r.venueId ? (
                        <>
                          <p className="text-gray-500 text-xs mb-1">Venue ID</p>
                          <div className="flex items-center gap-2 justify-end">
                            <code className="text-emerald-400 font-mono font-bold text-base">
                              {r.venueId}
                            </code>
                            <button
                              onClick={() => copyText(r.venueId!)}
                              className="text-gray-500 hover:text-white text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded transition-colors"
                            >
                              {copied === r.venueId ? "Copied!" : "Copy"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <span className="text-gray-600 text-xs">ID unknown</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!searched && (
            <div>
              <p className="text-gray-600 text-xs uppercase tracking-wider mb-3">Quick picks</p>
              <div className="flex flex-wrap gap-2">
                {["Carbone", "Lilia", "Don Angie", "4 Charles Prime Rib", "Atomix", "Le Bernardin"].map((name) => (
                  <button
                    key={name}
                    onClick={() => search(name)}
                    className="bg-gray-900 border border-gray-800 hover:border-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right: curated list sidebar */}
        <aside className="w-72 shrink-0 hidden lg:block">
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden sticky top-20">
            <div className="px-4 py-3 border-b border-gray-800">
              <p className="text-white font-semibold text-sm">Curated NYC List</p>
              <p className="text-gray-500 text-xs mt-0.5">{NYC_RESTAURANTS.length} restaurants · click to view</p>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-140px)]">
              {Object.entries(BY_NEIGHBORHOOD).sort().map(([hood, restaurants]) => (
                <div key={hood}>
                  <p className="px-4 py-2 text-gray-600 text-xs uppercase tracking-wider bg-gray-900/80 sticky top-0">
                    {hood}
                  </p>
                  {restaurants.map((r) => (
                    <button
                      key={r.venueId ?? r.name}
                      onClick={() => selectFromSidebar(r)}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-gray-200 text-xs font-medium truncate">{r.name}</p>
                          <p className="text-gray-500 text-xs truncate">{r.cuisine}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          {r.venueId && (
                            <code className="text-emerald-500 font-mono text-xs">{r.venueId}</code>
                          )}
                          <p className="text-gray-600 text-xs">{r.priceRange}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </aside>

      </div>
    </div>
  )
}
