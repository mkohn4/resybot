"use client"

import { useState } from "react"
import Link from "next/link"

type VenueResult = {
  venueId: number | null
  name: string
  neighborhood: string
  cuisine: string
  priceRange: string
  daysOut: number | null
  releaseTime: string | null
  releaseNotes: string
  source: "curated" | "resy"
}

export function VenueLookup() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<VenueResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)

  async function search() {
    if (query.trim().length < 2) return
    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/venues/lookup?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } finally {
      setLoading(false)
    }
  }

  function copyId(id: number) {
    navigator.clipboard.writeText(String(id))
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function formatReleaseTime(r: VenueResult) {
    if (!r.releaseTime || !r.daysOut) return null
    const [h, m] = r.releaseTime.split(":").map(Number)
    const ampm = h >= 12 ? "pm" : "am"
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
    return `${r.daysOut} days out at ${h12}:${m.toString().padStart(2, "0")}${ampm} ET`
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-400 hover:text-white transition-colors text-sm">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-bold text-white">Venue ID Lookup</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-gray-400 text-sm mb-6">
          Search any restaurant on Resy to find its venue ID. Curated spots include known release times.
        </p>

        {/* Search bar */}
        <div className="flex gap-2 mb-8">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search by restaurant name, neighborhood, or cuisine…"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
          <button
            onClick={search}
            disabled={loading || query.trim().length < 2}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold px-5 py-3 rounded-xl transition-colors text-sm shrink-0"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Results */}
        {searched && !loading && results.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg">No results found for &quot;{query}&quot;</p>
            <p className="text-sm mt-1">Try a different spelling or search the restaurant name only</p>
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
                      {r.priceRange && (
                        <span className="text-gray-500 text-xs">{r.priceRange}</span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs mb-2">
                      {r.neighborhood}{r.cuisine ? ` · ${r.cuisine}` : ""}
                    </p>
                    {formatReleaseTime(r) && (
                      <p className="text-blue-300 text-xs mb-1">
                        Reservations open {formatReleaseTime(r)}
                      </p>
                    )}
                    {r.releaseNotes && r.source === "curated" && (
                      <p className="text-gray-500 text-xs">{r.releaseNotes}</p>
                    )}
                    {r.source === "resy" && !r.releaseTime && (
                      <p className="text-amber-400/70 text-xs">No release time data — set snipe time manually</p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    {r.venueId ? (
                      <>
                        <p className="text-gray-400 text-xs mb-1">Venue ID</p>
                        <div className="flex items-center gap-2">
                          <code className="text-emerald-400 font-mono font-bold text-lg">
                            {r.venueId}
                          </code>
                          <button
                            onClick={() => copyId(r.venueId!)}
                            className="text-gray-500 hover:text-white transition-colors text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded"
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
          <div className="mt-4">
            <p className="text-gray-600 text-xs uppercase tracking-wider mb-3">Popular searches</p>
            <div className="flex flex-wrap gap-2">
              {["Carbone", "Lilia", "Don Angie", "4 Charles", "Atomix", "Le Bernardin", "Cosme", "Frenchette"].map((name) => (
                <button
                  key={name}
                  onClick={() => { setQuery(name); }}
                  className="bg-gray-900 border border-gray-800 hover:border-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
