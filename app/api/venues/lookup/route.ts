import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { NYC_RESTAURANTS } from "@/lib/restaurants"

const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5"

const BASE_HEADERS = {
  origin: "https://resy.com",
  "x-origin": "https://resy.com",
  "accept-language": "en-US,en;q=0.9",
  authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
  accept: "application/json, text/plain, */*",
  referer: "https://resy.com/",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) return NextResponse.json({ results: [] })

  // Search curated list first
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
    source: "curated" as const,
  }))

  // Also search Resy API live
  let resyResults: typeof curated = []
  try {
    const today = new Date().toISOString().split("T")[0]
    const params = new URLSearchParams({
      "x-resy-auth-token": "",
      day: today,
      lat: "40.7580",
      long: "-73.9855",
      party_size: "2",
      query: q,
    })
    const res = await fetch(`https://api.resy.com/4/find?${params}`, {
      headers: BASE_HEADERS,
    })
    if (res.ok) {
      const data = await res.json()
      const venues = data?.results?.venues ?? []
      const curatedIds = new Set(curated.map((r) => r.venueId))

      resyResults = venues
        .filter((v: { id?: { resy?: number } }) => {
          const id = v?.id?.resy
          return id && !curatedIds.has(id)
        })
        .slice(0, 8)
        .map((v: {
          id?: { resy?: number }
          name?: string
          location?: { neighborhood?: string }
          type?: string
        }) => ({
          venueId: v?.id?.resy ?? null,
          name: v?.name ?? "Unknown",
          neighborhood: v?.location?.neighborhood ?? "NYC",
          cuisine: v?.type ?? "",
          priceRange: "",
          daysOut: null,
          releaseTime: null,
          releaseNotes: "No release time data — check Reddit or restaurant website",
          source: "resy" as const,
        }))
    }
  } catch {
    // Resy API failure is non-fatal — curated results still return
  }

  return NextResponse.json({ results: [...curated, ...resyResults] })
}
