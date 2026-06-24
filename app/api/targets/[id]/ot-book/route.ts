import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { bookOTSlot, type OTSlot } from "@/lib/opentable"
import { sendBookingSuccess } from "@/lib/notify"

// Called from the browser after it finds an available OT slot.
// The browser passes the slot details; this route handles the booking
// and DB update. Booking also goes through the browser fetch (residential IP).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { slot }: { slot: OTSlot } = await req.json()
  if (!slot?.slotAvailabilityToken) return NextResponse.json({ error: "slot required" }, { status: 400 })

  const [target, profile] = await Promise.all([
    prisma.reservationTarget.findFirst({ where: { id, userId: session.user.id } }),
    prisma.oTGuestProfile.findUnique({ where: { userId: session.user.id } }),
  ])
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 })
  if (target.status === "BOOKED") return NextResponse.json({ error: "Already booked" }, { status: 400 })
  if (!profile) return NextResponse.json({ error: "No OpenTable guest profile on file" }, { status: 400 })

  const dateStr = target.date.toISOString().split("T")[0]

  try {
    await bookOTSlot(target.venueId, slot, dateStr, target.partySize, {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: target.notificationEmail ?? "",
      phone: profile.phone,
    })

    const bookedSlot = slot.dateTime
    const time = bookedSlot.split("T")[1]?.substring(0, 5) ?? ""

    await prisma.reservationTarget.update({
      where: { id },
      data: { status: "BOOKED", bookedSlot, lastAttemptAt: new Date() },
    })
    await prisma.snipeAttempt.create({ data: { targetId: id, success: true, slot: bookedSlot } })

    if (target.notificationEmail) {
      await sendBookingSuccess({
        to: target.notificationEmail,
        restaurantName: target.venueName,
        date: dateStr,
        time,
        partySize: target.partySize,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, slot: bookedSlot, time })
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    await prisma.snipeAttempt.create({ data: { targetId: id, success: false, error } })
    return NextResponse.json({ success: false, message: error }, { status: 500 })
  }
}
