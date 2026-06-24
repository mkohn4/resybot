import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { type OTSlot } from "@/lib/opentable"
import { sendBookingSuccess } from "@/lib/notify"

// Pure DB recorder — the browser does the actual OT booking POST (residential IP required).
// Browser passes the confirmed slot and reservationId after a successful booking.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { slot, reservationId }: { slot: OTSlot; reservationId: string } = await req.json()
  if (!slot?.slotAvailabilityToken) return NextResponse.json({ error: "slot required" }, { status: 400 })

  const target = await prisma.reservationTarget.findFirst({ where: { id, userId: session.user.id } })
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 })
  if (target.status === "BOOKED") return NextResponse.json({ error: "Already booked" }, { status: 400 })

  const dateStr = target.date.toISOString().split("T")[0]
  const bookedSlot = slot.dateTime
  const time = bookedSlot.split("T")[1]?.substring(0, 5) ?? ""

  await prisma.reservationTarget.update({
    where: { id },
    data: { status: "BOOKED", bookedSlot, lastAttemptAt: new Date() },
  })
  await prisma.snipeAttempt.create({
    data: { targetId: id, success: true, slot: bookedSlot },
  })

  if (target.notificationEmail) {
    await sendBookingSuccess({
      to: target.notificationEmail,
      restaurantName: target.venueName,
      date: dateStr,
      time,
      partySize: target.partySize,
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, slot: bookedSlot, time, reservationId })
}
