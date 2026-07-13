import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const targets = await prisma.reservationTarget.findMany({
    where: { userId: session.user.id },
    include: { attempts: { orderBy: { attemptAt: "desc" }, take: 5 } },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(targets)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { venueId, venueName, neighborhood, cuisine, date, dateEnd, partySize, preferredTimes, snipeAt, notificationEmail, mode, platform } = body

  if (!venueId || !venueName || !date || !snipeAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // Validate venueId
  const venueIdNum = Number(venueId)
  if (!Number.isInteger(venueIdNum) || venueIdNum <= 0) {
    return NextResponse.json({ error: "Invalid venue ID" }, { status: 400 })
  }

  // Validate party size (1–20)
  const partySizeNum = Number(partySize ?? 2)
  if (!Number.isInteger(partySizeNum) || partySizeNum < 1 || partySizeNum > 20) {
    return NextResponse.json({ error: "Party size must be between 1 and 20" }, { status: 400 })
  }

  // Validate dates parse correctly
  const dateObj = new Date(date)
  const snipeAtObj = new Date(snipeAt)
  if (Number.isNaN(dateObj.getTime()) || Number.isNaN(snipeAtObj.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  }

  const isWatch = mode === "WATCH"

  // Optional date range (WATCH only): dateEnd is the inclusive last day to watch.
  // Must parse, be >= date, and span at most 14 days to bound per-tick API calls.
  let dateEndObj: Date | null = null
  if (dateEnd && isWatch) {
    dateEndObj = new Date(dateEnd)
    if (Number.isNaN(dateEndObj.getTime())) {
      return NextResponse.json({ error: "Invalid end date" }, { status: 400 })
    }
    if (dateEndObj < dateObj) {
      return NextResponse.json({ error: "End date must be on or after the start date" }, { status: 400 })
    }
    const spanDays = Math.round((dateEndObj.getTime() - dateObj.getTime()) / (24 * 60 * 60 * 1000))
    if (spanDays > 14) {
      return NextResponse.json({ error: "Watch range can span at most 14 days" }, { status: 400 })
    }
    // Collapse a single-day range to null so it behaves like a normal watch
    if (dateEndObj.toISOString().split("T")[0] === dateObj.toISOString().split("T")[0]) dateEndObj = null
  }

  // Reject reservation dates before today. The date is stored as noon, so a same-day
  // booking (e.g. "Book Now for tonight") is still allowed even if it's already past
  // noon — we only block dates that fall on a prior calendar day.
  if (dateObj.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Reservation date must not be in the past" }, { status: 400 })
  }

  // Preferred times: use provided non-empty array, else fall back to defaults
  const times = Array.isArray(preferredTimes) && preferredTimes.length > 0
    ? preferredTimes
    : ["20:00", "20:15", "20:30", "19:30", "19:45", "20:45", "21:00"]

  // Confirm the user has the credential for the chosen platform
  const targetPlatform = platform === "OPENTABLE" ? "OPENTABLE" : "RESY"
  if (targetPlatform === "OPENTABLE") {
    const otProfile = await prisma.oTGuestProfile.findUnique({ where: { userId: session.user.id } })
    if (!otProfile?.encryptedBearerToken) {
      return NextResponse.json({ error: "Connect your OpenTable account before adding an OpenTable target" }, { status: 400 })
    }
  } else {
    const cred = await prisma.resyCredential.findUnique({ where: { userId: session.user.id } })
    if (!cred) {
      return NextResponse.json({ error: "Connect your Resy account before adding a Resy target" }, { status: 400 })
    }
  }

  const target = await prisma.reservationTarget.create({
    data: {
      userId: session.user.id,
      platform: targetPlatform,
      venueId: venueIdNum,
      venueName,
      neighborhood,
      cuisine,
      date: dateObj,
      dateEnd: dateEndObj,
      partySize: partySizeNum,
      preferredTimes: times,
      snipeAt: snipeAtObj,
      mode: isWatch ? "WATCH" : "SNIPE",
      status: isWatch ? "WATCHING" : "PENDING",
      notificationEmail: notificationEmail ?? session.user.email,
    },
  })

  return NextResponse.json(target, { status: 201 })
}
