import { NextRequest, NextResponse } from "next/server"
import { NYC_RESTAURANTS } from "@/lib/restaurants"
import { searchOTVenues } from "@/lib/opentable"
import { RESY_API_KEY } from "@/lib/resy"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/crypto"

const PRICE_LABELS: Record<number, string> = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" }

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const platformFilter = req.nextUrl.searchParams.get("platform") // "resy" | "opentable" | null (both)
  if (q.length < 2) return NextResponse.json({ results: [] })

  // Search curated list (Resy + OT entries)
  const ql = q.toLowerCase()
  const matchesCurated = (r: typeof NYC_RESTAURANTS[0]) =>
    r.name.toLowerCase().includes(ql) ||
    r.neighborhood.toLowerCase().includes(ql) ||
    r.cuisine.toLowerCase().includes(ql)

  const curated = NYC_RESTAURANTS.filter((r) => {
    const platform = r.platform ?? "resy"
    if (platformFilter && platformFilter !== platform) return false
    return matchesCurated(r)
  }).map((r) => ({
    venueId: r.venueId,
    name: r.name,
    neighborhood: r.neighborhood,
    cuisine: r.cuisine,
    priceRange: r.priceRange,
    daysOut: r.daysOut,
    releaseTime: r.releaseTime,
    releaseNotes: r.releaseNotes,
    platform: (r.platform ?? "resy") as "resy" | "opentable",
    source: "curated" as const,
  }))

  // Names from curated OT entries — used to suppress duplicate live OT results
  const curatedOTNames = new Set(
    curated.filter((r) => r.platform === "opentable").map((r) => r.name.toLowerCase())
  )

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

  // Search OpenTable via mobile API using the user's stored bearer token
  let otResults: {
    venueId: number; name: string; neighborhood: string; cuisine: string
    priceRange: string; daysOut: number | null; releaseTime: string | null; releaseNotes: string
    platform: "opentable"; source: "opentable"
  }[] = []
  if (!platformFilter || platformFilter === "opentable") {
    try {
      const session = await auth()
      if (session?.user?.id) {
        const otProfile = await prisma.oTGuestProfile.findUnique({ where: { userId: session.user.id } })
        if (otProfile?.encryptedBearerToken) {
          const bearerToken = decrypt(otProfile.encryptedBearerToken)
          const venues = await searchOTVenues(q, bearerToken)
          otResults = venues
            .filter((v) => !curatedOTNames.has(v.name.toLowerCase()))
            .map((v) => {
              const curatedMatch = NYC_RESTAURANTS.find(
                (r) => (r.platform === "opentable") && r.name.toLowerCase() === v.name.toLowerCase()
              )
              return {
                venueId: v.id,
                name: v.name,
                neighborhood: v.neighborhood,
                cuisine: v.cuisine,
                priceRange: curatedMatch?.priceRange ?? "",
                daysOut: curatedMatch?.daysOut ?? null,
                releaseTime: curatedMatch?.releaseTime ?? null,
                releaseNotes: curatedMatch?.releaseNotes ?? "OpenTable — no release time data",
                platform: "opentable" as const,
                source: "opentable" as const,
              }
            })
        }
      }
    } catch { /* non-fatal */ }
  }

  // For curated OT entries with no venueId, only show them if the live OT search
  // didn't already return a result for that restaurant (live result has the real venueId)
  const liveOTNames = new Set(otResults.map((r) => r.name.toLowerCase()))
  const filteredCurated = curated.filter(
    (r) => !(r.platform === "opentable" && r.venueId === null && liveOTNames.has(r.name.toLowerCase()))
  )

  return NextResponse.json({ results: [...filteredCurated, ...resyResults, ...otResults] })
}
