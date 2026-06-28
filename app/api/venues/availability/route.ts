import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { decrypt, encrypt } from "@/lib/crypto"
import { resyLogin, findSlots } from "@/lib/resy"
import { findOTSlots, OTAuthError } from "@/lib/opentable"

// GET /api/venues/availability?venueId=123&platform=resy&date=2026-07-10&partySize=2
// Returns the currently-bookable times for a venue/date so the UI can highlight
// what's open right now (used by Book Now / Watch mode). Reuses the same slot
// fetchers as the snipe handler — no booking is performed.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const venueId = Number(req.nextUrl.searchParams.get("venueId"))
  const platform = req.nextUrl.searchParams.get("platform") === "opentable" ? "OPENTABLE" : "RESY"
  const date = req.nextUrl.searchParams.get("date")?.trim() ?? ""
  const partySize = Number(req.nextUrl.searchParams.get("partySize") ?? "2")

  if (!Number.isInteger(venueId) || venueId <= 0) return NextResponse.json({ error: "Invalid venue ID" }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) return NextResponse.json({ error: "Invalid party size" }, { status: 400 })

  try {
    if (platform === "OPENTABLE") {
      const profile = await prisma.oTGuestProfile.findUnique({ where: { userId } })
      if (!profile?.encryptedBearerToken) return NextResponse.json({ error: "Connect your OpenTable account first" }, { status: 400 })
      const bearerToken = decrypt(profile.encryptedBearerToken)
      const slots = await findOTSlots(venueId, date, partySize, bearerToken)
      // findOTSlots already drops unavailable slots; extract unique HH:MM times
      const times = uniqueSorted(slots.map((s) => s.dateTime.split("T")[1]?.substring(0, 5)).filter(Boolean) as string[])
      return NextResponse.json({ times })
    }

    // Resy — reuse cached auth token or log in fresh (same logic as the snipe route)
    const cred = await prisma.resyCredential.findUnique({ where: { userId } })
    if (!cred) return NextResponse.json({ error: "Connect your Resy account first" }, { status: 400 })

    let authToken: string
    const tokenValid = cred.encryptedAuthToken && cred.tokenExpiresAt && cred.tokenExpiresAt > new Date()
    if (tokenValid && cred.encryptedAuthToken) {
      authToken = decrypt(cred.encryptedAuthToken)
    } else {
      const freshAuth = await resyLogin(decrypt(cred.encryptedEmail), decrypt(cred.encryptedPassword))
      authToken = freshAuth.token
      await prisma.resyCredential.update({
        where: { userId },
        data: {
          encryptedAuthToken: encrypt(authToken),
          paymentMethodId: freshAuth.paymentMethodId,
          tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })
    }

    const slots = await findSlots(venueId, date, partySize, authToken)
    // Skip patio/outdoor — those are never bookable by the bot, mirror pickBestSlot
    const isPatio = (type: string) => {
      const t = type.toLowerCase()
      return t.includes("patio") || t.includes("outside") || t.includes("outdoor")
    }
    const times = uniqueSorted(
      slots
        .filter((s) => !isPatio(s.config.type ?? ""))
        .map((s) => s.date.start.split(" ")[1]?.substring(0, 5))
        .filter(Boolean) as string[]
    )
    return NextResponse.json({ times })
  } catch (err: unknown) {
    if (err instanceof OTAuthError) {
      return NextResponse.json({ error: "Your OpenTable token expired — reconnect your account" }, { status: 401 })
    }
    const error = err instanceof Error ? err.message : String(err)
    console.error("[availability] error", { venueId, platform, error })
    return NextResponse.json({ error: "Could not fetch availability" }, { status: 502 })
  }
}

function uniqueSorted(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort()
}
