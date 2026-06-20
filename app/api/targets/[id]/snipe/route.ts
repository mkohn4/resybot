import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { decrypt, encrypt } from "@/lib/crypto"
import { resyLogin, findSlots, pickBestSlot, bookSlot } from "@/lib/resy"
import { sendBookingSuccess, sendBookingFailed } from "@/lib/notify"

// Immediately attempt to snipe a target (no waiting for cron)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const target = await prisma.reservationTarget.findFirst({
    where: { id, userId: session.user.id },
    include: { user: { include: { resyCredential: true } } },
  })
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 })
  if (target.status === "BOOKED") return NextResponse.json({ error: "Already booked" }, { status: 400 })

  const cred = target.user.resyCredential
  if (!cred) return NextResponse.json({ error: "No Resy credentials on file" }, { status: 400 })

  // Get or refresh auth token
  let authToken: string
  const tokenValid = cred.encryptedAuthToken && cred.tokenExpiresAt && cred.tokenExpiresAt > new Date()
  if (tokenValid && cred.encryptedAuthToken) {
    authToken = decrypt(cred.encryptedAuthToken)
  } else {
    const email = decrypt(cred.encryptedEmail)
    const password = decrypt(cred.encryptedPassword)
    const freshAuth = await resyLogin(email, password)
    authToken = freshAuth.token
    await prisma.resyCredential.update({
      where: { userId: session.user.id },
      data: {
        encryptedAuthToken: encrypt(authToken),
        paymentMethodId: freshAuth.paymentMethodId,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
  }

  const paymentMethodId = cred.paymentMethodId
  if (!paymentMethodId) return NextResponse.json({ error: "No payment method on file" }, { status: 400 })

  const dateStr = target.date.toISOString().split("T")[0]

  await prisma.reservationTarget.update({
    where: { id },
    data: { status: "SNIPING", lastAttemptAt: new Date() },
  })

  try {
    const slots = await findSlots(target.venueId, dateStr, target.partySize, authToken)
    const best = pickBestSlot(slots, target.preferredTimes, dateStr)

    if (!best) {
      await prisma.reservationTarget.update({ where: { id }, data: { status: "PENDING" } })
      await prisma.snipeAttempt.create({
        data: { targetId: id, success: false, error: "No matching slots available right now" },
      })
      return NextResponse.json({ success: false, message: "No matching slots available right now" })
    }

    await bookSlot(authToken, paymentMethodId, best.config.token, dateStr, target.partySize)
    const slot = best.date.start
    const time = slot.split(" ")[1]?.substring(0, 5) ?? ""

    await prisma.reservationTarget.update({
      where: { id },
      data: { status: "BOOKED", bookedSlot: slot, lastAttemptAt: new Date() },
    })
    await prisma.snipeAttempt.create({ data: { targetId: id, success: true, slot } })

    if (target.notificationEmail) {
      await sendBookingSuccess({
        to: target.notificationEmail,
        restaurantName: target.venueName,
        date: dateStr,
        time,
        partySize: target.partySize,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, slot, time })
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    await prisma.reservationTarget.update({ where: { id }, data: { status: "PENDING" } })
    await prisma.snipeAttempt.create({ data: { targetId: id, success: false, error } })

    if (target.notificationEmail) {
      await sendBookingFailed({
        to: target.notificationEmail,
        restaurantName: target.venueName,
        date: dateStr,
        error,
      }).catch(() => {})
    }

    return NextResponse.json({ success: false, message: error }, { status: 500 })
  }
}
