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
  const {
    venueId,
    venueName,
    neighborhood,
    cuisine,
    date,
    partySize,
    preferredTimes,
    snipeAt,
    notificationEmail,
  } = body

  if (!venueId || !venueName || !date || !snipeAt) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const target = await prisma.reservationTarget.create({
    data: {
      userId: session.user.id,
      venueId: Number(venueId),
      venueName,
      neighborhood,
      cuisine,
      date: new Date(date),
      partySize: Number(partySize ?? 2),
      preferredTimes: preferredTimes ?? ["19:30", "19:45", "20:00", "20:15", "20:30", "20:45", "21:00"],
      snipeAt: new Date(snipeAt),
      notificationEmail: notificationEmail ?? session.user.email,
      status: "PENDING",
    },
  })

  return NextResponse.json(target, { status: 201 })
}
