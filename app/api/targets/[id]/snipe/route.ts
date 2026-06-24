import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { decrypt, encrypt } from "@/lib/crypto"
import { resyLogin, findSlots, pickBestSlot, bookSlot } from "@/lib/resy"
import { findOTSlots, pickBestOTSlot, bookOTSlot } from "@/lib/opentable"
import { sendBookingSuccess, sendBookingFailed } from "@/lib/notify"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const target = await prisma.reservationTarget.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 })
  if (target.status === "BOOKED") return NextResponse.json({ error: "Already booked" }, { status: 400 })

  const dateStr = target.date.toISOString().split("T")[0]
  const stillFuture = new Date(target.date) > new Date()

  await prisma.reservationTarget.update({
    where: { id },
    data: { status: "SNIPING", lastAttemptAt: new Date() },
  })

  // Route to correct platform handler
  if (target.platform === "OPENTABLE") {
    return handleOTSnipe({ id, target, dateStr, stillFuture, userId: session.user.id })
  }
  return handleResySnipe({ id, target, dateStr, stillFuture, userId: session.user.id })
}

async function handleResySnipe({ id, target, dateStr, stillFuture, userId }: {
  id: string
  target: { venueId: number; partySize: number; preferredTimes: string[]; notificationEmail: string | null; venueName: string; date: Date }
  dateStr: string
  stillFuture: boolean
  userId: string
}) {
  const cred = await prisma.resyCredential.findUnique({ where: { userId } })
  if (!cred) return NextResponse.json({ error: "No Resy credentials on file" }, { status: 400 })

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

  const paymentMethodId = cred.paymentMethodId
  if (!paymentMethodId) return NextResponse.json({ error: "No payment method on file" }, { status: 400 })

  try {
    const slots = await findSlots(target.venueId, dateStr, target.partySize, authToken)
    const best = pickBestSlot(slots, target.preferredTimes, dateStr)

    if (!best) {
      await prisma.reservationTarget.update({
        where: { id },
        data: stillFuture ? { status: "WATCHING", mode: "WATCH" } : { status: "PENDING" },
      })
      await prisma.snipeAttempt.create({ data: { targetId: id, success: false, error: "No matching slots available right now" } })
      return NextResponse.json({
        success: false,
        fallbackToWatch: stillFuture,
        message: stillFuture ? "No slots right now — switched to Watch mode" : "No matching slots available right now",
      })
    }

    await bookSlot(authToken, paymentMethodId, best.config.token, dateStr, target.partySize)
    const slot = best.date.start
    const time = slot.split(" ")[1]?.substring(0, 5) ?? ""

    await prisma.reservationTarget.update({ where: { id }, data: { status: "BOOKED", bookedSlot: slot, lastAttemptAt: new Date() } })
    await prisma.snipeAttempt.create({ data: { targetId: id, success: true, slot } })
    if (target.notificationEmail) {
      await sendBookingSuccess({ to: target.notificationEmail, restaurantName: target.venueName, date: dateStr, time, partySize: target.partySize }).catch(() => {})
    }
    return NextResponse.json({ success: true, slot, time })
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    await prisma.reservationTarget.update({ where: { id }, data: stillFuture ? { status: "WATCHING", mode: "WATCH" } : { status: "FAILED" } })
    await prisma.snipeAttempt.create({ data: { targetId: id, success: false, error } })
    if (target.notificationEmail) {
      await sendBookingFailed({ to: target.notificationEmail, restaurantName: target.venueName, date: dateStr, error, platform: "RESY" }).catch(() => {})
    }
    return NextResponse.json({ success: false, message: error }, { status: 500 })
  }
}

async function handleOTSnipe({ id, target, dateStr, stillFuture, userId }: {
  id: string
  target: { venueId: number; partySize: number; preferredTimes: string[]; notificationEmail: string | null; venueName: string; date: Date }
  dateStr: string
  stillFuture: boolean
  userId: string
}) {
  const profile = await prisma.oTGuestProfile.findUnique({ where: { userId } })
  if (!profile) return NextResponse.json({ error: "No OpenTable profile on file — connect your account in settings" }, { status: 400 })
  if (!profile.encryptedBearerToken) return NextResponse.json({ error: "No OpenTable Bearer token on file — reconnect your account" }, { status: 400 })

  const bearerToken = decrypt(profile.encryptedBearerToken)
  const guestEmail = target.notificationEmail ?? ""

  try {
    const slots = await findOTSlots(target.venueId, dateStr, target.partySize, bearerToken)
    const best = pickBestOTSlot(slots, target.preferredTimes)

    if (!best) {
      await prisma.reservationTarget.update({
        where: { id },
        data: stillFuture ? { status: "WATCHING", mode: "WATCH" } : { status: "PENDING" },
      })
      await prisma.snipeAttempt.create({ data: { targetId: id, success: false, error: "No matching slots available right now" } })
      return NextResponse.json({
        success: false,
        fallbackToWatch: stillFuture,
        message: stillFuture ? "No slots right now — switched to Watch mode" : "No matching slots available right now",
      })
    }

    await bookOTSlot(target.venueId, best, target.partySize, {
      firstName: profile.firstName,
      lastName: decrypt(profile.encryptedLastName),
      email: guestEmail,
      phone: decrypt(profile.encryptedPhone),
      gpid: profile.gpid,
      customerId: profile.customerId,
    }, bearerToken)
    const slot = best.dateTime
    const time = slot.split("T")[1]?.substring(0, 5) ?? ""

    await prisma.reservationTarget.update({ where: { id }, data: { status: "BOOKED", bookedSlot: slot, lastAttemptAt: new Date() } })
    await prisma.snipeAttempt.create({ data: { targetId: id, success: true, slot } })
    if (target.notificationEmail) {
      await sendBookingSuccess({ to: target.notificationEmail, restaurantName: target.venueName, date: dateStr, time, partySize: target.partySize }).catch(() => {})
    }
    return NextResponse.json({ success: true, slot, time })
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err)
    await prisma.reservationTarget.update({ where: { id }, data: stillFuture ? { status: "WATCHING", mode: "WATCH" } : { status: "FAILED" } })
    await prisma.snipeAttempt.create({ data: { targetId: id, success: false, error } })
    if (target.notificationEmail) {
      await sendBookingFailed({ to: target.notificationEmail, restaurantName: target.venueName, date: dateStr, error, platform: "OPENTABLE" }).catch(() => {})
    }
    return NextResponse.json({ success: false, message: error }, { status: 500 })
  }
}
