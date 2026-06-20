import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { resyLogin, findSlots, pickBestSlot, bookSlot } from "@/lib/resy"
import { sendBookingSuccess, sendBookingFailed } from "@/lib/notify"

// Vercel cron calls this — protected by CRON_SECRET header
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  // Find all PENDING targets whose snipeAt window is now (within the last 2 minutes)
  const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000)

  const targets = await prisma.reservationTarget.findMany({
    where: {
      status: "PENDING",
      snipeAt: { gte: twoMinsAgo, lte: now },
    },
    include: { user: { include: { resyCredential: true } } },
  })

  if (targets.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  const results = await Promise.allSettled(
    targets.map((target: typeof targets[number]) => processTarget(target))
  )

  const summary = results.map((r: PromiseSettledResult<{ success: boolean; slot?: string; error?: string }>, i: number) => ({
    targetId: targets[i].id,
    restaurant: targets[i].venueName,
    result: r.status === "fulfilled" ? r.value : { error: String((r as PromiseRejectedResult).reason) },
  }))

  return NextResponse.json({ processed: targets.length, summary })
}

async function processTarget(target: {
  id: string
  userId: string
  venueId: number
  venueName: string
  date: Date
  partySize: number
  preferredTimes: string[]
  notificationEmail: string | null
  user: { resyCredential: { encryptedEmail: string; encryptedPassword: string; encryptedAuthToken: string | null; paymentMethodId: string | null; tokenExpiresAt: Date | null } | null }
}) {
  const cred = target.user.resyCredential
  if (!cred) {
    await prisma.reservationTarget.update({
      where: { id: target.id },
      data: { status: "FAILED", lastAttemptAt: new Date() },
    })
    throw new Error("No Resy credentials on file")
  }

  // Re-auth if token is missing or expired
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
      where: { userId: target.userId },
      data: {
        encryptedAuthToken: (await import("@/lib/crypto")).encrypt(authToken),
        paymentMethodId: freshAuth.paymentMethodId,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
  }

  const paymentMethodId = cred.paymentMethodId
  if (!paymentMethodId) throw new Error("No payment method on file")

  const dateStr = target.date.toISOString().split("T")[0]

  await prisma.reservationTarget.update({
    where: { id: target.id },
    data: { status: "SNIPING", lastAttemptAt: new Date() },
  })

  // Snipe loop: try for 10 seconds
  const deadline = Date.now() + 10_000
  let lastError = ""

  while (Date.now() < deadline) {
    try {
      const slots = await findSlots(target.venueId, dateStr, target.partySize, authToken)
      const best = pickBestSlot(slots, target.preferredTimes, dateStr)

      if (best) {
        await bookSlot(authToken, paymentMethodId, best.config.token, dateStr, target.partySize)
        const slot = best.date.start

        await prisma.reservationTarget.update({
          where: { id: target.id },
          data: { status: "BOOKED", bookedSlot: slot, lastAttemptAt: new Date() },
        })
        await prisma.snipeAttempt.create({
          data: { targetId: target.id, success: true, slot },
        })

        if (target.notificationEmail) {
          const time = slot.split(" ")[1]?.substring(0, 5) ?? ""
          await sendBookingSuccess({
            to: target.notificationEmail,
            restaurantName: target.venueName,
            date: dateStr,
            time,
            partySize: target.partySize,
          }).catch(() => {}) // don't fail the snipe if email fails
        }

        return { success: true, slot }
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
    }

    await new Promise((r) => setTimeout(r, 500))
  }

  // No slot found
  await prisma.reservationTarget.update({
    where: { id: target.id },
    data: { status: "FAILED", lastAttemptAt: new Date() },
  })
  await prisma.snipeAttempt.create({
    data: { targetId: target.id, success: false, error: lastError || "No matching slots found" },
  })

  if (target.notificationEmail) {
    await sendBookingFailed({
      to: target.notificationEmail,
      restaurantName: target.venueName,
      date: dateStr,
      error: lastError || "No matching slots in your preferred time range",
    }).catch(() => {})
  }

  return { success: false, error: lastError }
}
