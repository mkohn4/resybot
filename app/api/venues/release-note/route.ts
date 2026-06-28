import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { venueNameKey } from "@/lib/restaurants"

function normalizePlatform(p: unknown): "RESY" | "OPENTABLE" {
  return p === "OPENTABLE" || p === "opentable" ? "OPENTABLE" : "RESY"
}

// GET /api/venues/release-note?name=Carbone&platform=resy
// Returns the community-curated release note for a restaurant, if one exists.
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? ""
  const platform = normalizePlatform(req.nextUrl.searchParams.get("platform"))
  if (name.length < 1) return NextResponse.json({ note: null })

  const note = await prisma.venueReleaseNote.findUnique({
    where: { nameKey_platform: { nameKey: venueNameKey(name), platform } },
  })
  return NextResponse.json({ note })
}

// POST /api/venues/release-note — upsert the community note for a restaurant.
// Body: { name, platform, notes, releaseTime?, daysOut? }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const platform = normalizePlatform(body.platform)
  const notes = typeof body.notes === "string" ? body.notes.trim() : ""

  if (!name) return NextResponse.json({ error: "Restaurant name is required" }, { status: 400 })
  if (!notes) return NextResponse.json({ error: "Note text is required" }, { status: 400 })
  if (notes.length > 1000) return NextResponse.json({ error: "Note is too long (max 1000 chars)" }, { status: 400 })

  // Optional release time — validate HH:MM 24h if provided
  let releaseTime: string | null = null
  if (body.releaseTime != null && body.releaseTime !== "") {
    const rt = String(body.releaseTime).trim()
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rt)) {
      return NextResponse.json({ error: "Release time must be HH:MM (24-hour ET)" }, { status: 400 })
    }
    releaseTime = rt
  }

  // Optional days-out — validate 0–365 if provided
  let daysOut: number | null = null
  if (body.daysOut != null && body.daysOut !== "") {
    const d = Number(body.daysOut)
    if (!Number.isInteger(d) || d < 0 || d > 365) {
      return NextResponse.json({ error: "Days out must be a whole number between 0 and 365" }, { status: 400 })
    }
    daysOut = d
  }

  const nameKey = venueNameKey(name)
  const editorName = session.user.name ?? session.user.email ?? null

  const note = await prisma.venueReleaseNote.upsert({
    where: { nameKey_platform: { nameKey, platform } },
    create: {
      nameKey,
      platform,
      displayName: name,
      notes,
      releaseTime,
      daysOut,
      updatedById: session.user.id,
      updatedByName: editorName,
    },
    update: {
      displayName: name,
      notes,
      releaseTime,
      daysOut,
      updatedById: session.user.id,
      updatedByName: editorName,
    },
  })

  return NextResponse.json({ note })
}
