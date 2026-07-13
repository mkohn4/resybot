import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const target = await prisma.reservationTarget.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.reservationTarget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const target = await prisma.reservationTarget.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  if (body.status !== undefined && body.status !== "CANCELLED") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  // Date / date-range edits. The effective start is the incoming date (if any)
  // else the target's current date; dateEnd is validated against it. dateEnd is
  // a watch-only range end: must parse, be >= start, span <= 14 days. Passing
  // dateEnd: null clears the range back to a single day.
  const dateData: { date?: Date; dateEnd?: Date | null } = {}
  if (body.date !== undefined) {
    const d = new Date(body.date)
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 })
    dateData.date = d
  }
  if (body.dateEnd !== undefined) {
    if (body.dateEnd === null) {
      dateData.dateEnd = null
    } else {
      const end = new Date(body.dateEnd)
      if (Number.isNaN(end.getTime())) return NextResponse.json({ error: "Invalid end date" }, { status: 400 })
      const start = dateData.date ?? target.date
      if (end < start) return NextResponse.json({ error: "End date must be on or after the start date" }, { status: 400 })
      const spanDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
      if (spanDays > 14) return NextResponse.json({ error: "Watch range can span at most 14 days" }, { status: 400 })
      // Collapse a single-day range to null
      dateData.dateEnd = end.toISOString().split("T")[0] === start.toISOString().split("T")[0] ? null : end
    }
  }

  const updated = await prisma.reservationTarget.update({
    where: { id },
    data: {
      ...(body.status === "CANCELLED" && { status: body.status }),
      ...(body.partySize && { partySize: Number(body.partySize) }),
      ...(body.preferredTimes && { preferredTimes: body.preferredTimes }),
      ...(body.snipeAt && { snipeAt: new Date(body.snipeAt) }),
      ...dateData,
    },
  })
  return NextResponse.json(updated)
}
