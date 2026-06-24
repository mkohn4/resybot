import { NextRequest, NextResponse } from "next/server"
import { NYC_RESTAURANTS } from "@/lib/restaurants"
import { searchOTVenues } from "@/lib/opentable"

const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"
const PRICE_LABELS: Record<number, string> = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const platformFilter = req.nextUrl.searchParams.get("platform") // "resy" | "opentable" | null (both)
  if (q.length < 2) return NextResponse.json({ results: [] })

  // Search curated list (Resy)
  const curated = NYC_RESTAURANTS.filter(
    (r) =>
      r.name.toLowerCase().includes(q.toLowerCase()) ||
      r.neighborhood.toLowerCase().includes(q.toLowerCase()) ||
      r.cuisine.toLowerCase().includes(q.toLowerCase())
  ).map((r) => ({
    venueId: r.venueId,
    name: r.name,
    neighborhood: r.neighborhood,
    cuisine: r.cuisine,
    priceRange: r.priceRange,
    daysOut: r.daysOut,
    releaseTime: r.releaseTime,
    releaseNotes: r.releaseNotes,
    platform: "resy" as const,
    source: "curated" as const,
  }))

  // Search Resy live
  let resyResults: typeof curated = []
  if (!platformFilter || platformFilter === "resy") {
    try {
      const res = await fetch("https://api.resy.com/3/venuesearch/search", {
        method: "POST",
        headers: {
          origin: "https://resy.com",
          "x-origin": "https://resy.com",
          authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
          "content-type": "application/json",
          accept: "application/json",
          referer: "https://resy.com/",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({ query: q, geo: { latitude: 40.758, longitude: -73.9855 }, per_page: 10 }),
      })
      if (res.ok) {
        const data = await res.json()
        const hits = data?.search?.hits ?? []
        const curatedIds = new Set(curated.map((r) => r.venueId))
        resyResults = hits
          .filter((v: { id?: { resy?: number } }) => !curatedIds.has(v?.id?.resy ?? null))
          .map((v: { id?: { resy?: number }; name?: string; neighborhood?: string; cuisine?: string[]; price_range_id?: number }) => ({
            venueId: v?.id?.resy ?? null,
            name: v?.name ?? "Unknown",
            neighborhood: v?.neighborhood ?? "NYC",
            cuisine: v?.cuisine?.[0] ?? "",
            priceRange: PRICE_LABELS[v?.price_range_id ?? 0] ?? "",
            daysOut: null,
            releaseTime: null,
            releaseNotes: "No release time data — set snipe time manually",
            platform: "resy" as const,
            source: "resy" as const,
          }))
      }
    } catch { /* non-fatal */ }
  }

  // Search OpenTable live
  let otResults: {
    venueId: number | null; name: string; neighborhood: string; cuisine: string
    priceRange: string; daysOut: null; releaseTime: null; releaseNotes: string
    platform: "opentable"; source: "opentable"
  }[] = []
  if (!platformFilter || platformFilter === "opentable") {
    try {
      const venues = await searchOTVenues(q)
      otResults = venues.map((v) => ({
        venueId: v.id,
        name: v.name,
        neighborhood: v.neighborhood,
        cuisine: v.cuisine,
        priceRange: "",
        daysOut: null,
        releaseTime: null,
        releaseNotes: "OpenTable — no release time data",
        platform: "opentable" as const,
        source: "opentable" as const,
      }))
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ results: [...curated, ...resyResults, ...otResults] })
}
