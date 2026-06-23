import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { decrypt, encrypt } from "@/lib/crypto"
import { resyLogin, findSlots, pickBestSlot, bookSlot } from "@/lib/resy"
import { sendBookingSuccess, sendBookingFailed } from "@/lib/notify"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const now = new Date()
    const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000)

    // Neon HTTP adapter doesn't support OR clauses (triggers implicit transactions)
    // Run two separate queries and merge
    const [snipeTargets, watchTargets] = await Promise.all([
      prisma.reservationTarget.findMany({
        where: { status: "PENDING", mode: "SNIPE", snipeAt: { gte: twoMinsAgo, lte: now } },
      }),
      prisma.reservationTarget.findMany({
        where: { status: "WATCHING", mode: "WATCH", date: { gte: now } },
      }),
    ])
    const targets = [...snipeTargets, ...watchTargets]

    // Fetch credentials separately — Neon HTTP adapter doesn't support nested includes
    const userIds = [...new Set(targets.map((t) => t.userId))]
    const credentials = userIds.length > 0
      ? await prisma.resyCredential.findMany({ where: { userId: { in: userIds } } })
      : []
    const credsByUserId = Object.fromEntries(credentials.map((c) => [c.userId, c]))

    const targetsWithCreds = targets.map((t) => ({
      ...t,
      user: { resyCredential: credsByUserId[t.userId] ?? null },
    }))

    // Auto-expire WATCH targets whose date has passed
    await prisma.reservationTarget.updateMany({
      where: { mode: "WATCH", status: "WATCHING", date: { lt: now } },
      data: { status: "FAILED" },
    })

    // Delete old BOOKED/FAILED/CANCELLED targets once per day (at the first cron tick of each hour 0)
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 2) {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      await prisma.reservationTarget.deleteMany({
        where: {
          status: { in: ["BOOKED", "FAILED", "CANCELLED"] },
          date: { lt: sevenDaysAgo },
        },
      })
    }

    if (targetsWithCreds.length === 0) return NextResponse.json({ processed: 0 })

    const results = await Promise.allSettled(
      targetsWithCreds.map((t) => processTarget(t))
    )

    const summary = results.map((r: PromiseSettledResult<{ success: boolean; slot?: string; error?: string }>, i: number) => ({
      targetId: targetsWithCreds[i].id,
      restaurant: targetsWithCreds[i].venueName,
      mode: targetsWithCreds[i].mode,
      result: r.status === "fulfilled" ? r.value : { error: String((r as PromiseRejectedResult).reason) },
    }))

    return NextResponse.json({ processed: targets.length, summary })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Cron handler error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export type TargetRow = {
  id: string
  userId: string
  venueId: number
  venueName: string
  date: Date
  partySize: number
  preferredTimes: string[]
  mode: string
  notificationEmail: string | null
  user: {
    resyCredential: {
      encryptedEmail: string
      encryptedPassword: string
      encryptedAuthToken: string | null
      paymentMethodId: string | null
      tokenExpiresAt: Date | null
    } | null
  }
}

export async function processTarget(target: TargetRow) {
  const cred = target.user.resyCredential
  if (!cred) {
    await prisma.reservationTarget.update({
      where: { id: target.id },
      data: { status: "FAILED", lastAttemptAt: new Date() },
    })
    throw new Error("No Resy credentials on file")
  }

  // Get/refresh auth token
  let authToken: string
  const tokenValid = cred.encryptedAuthToken && cred.tokenExpiresAt && cred.tokenExpiresAt > new Date()
  if (tokenValid && cred.encryptedAuthToken) {
    authToken = decrypt(cred.encryptedAuthToken)
  } else {
    const freshAuth = await resyLogin(decrypt(cred.encryptedEmail), decrypt(cred.encryptedPassword))
    authToken = freshAuth.token
    await prisma.resyCredential.update({
      where: { userId: target.userId },
      data: {
        encryptedAuthToken: encrypt(authToken),
        paymentMethodId: freshAuth.paymentMethodId,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
  }

  const paymentMethodId = cred.paymentMethodId
  if (!paymentMethodId) throw new Error("No payment method on file")

  const dateStr = target.date.toISOString().split("T")[0]
  const isWatch = target.mode === "WATCH"

  // Mark as actively trying (SNIPING for one-shot, stay WATCHING for watch mode)
  await prisma.reservationTarget.update({
    where: { id: target.id },
    data: { status: isWatch ? "WATCHING" : "SNIPING", lastAttemptAt: new Date() },
  })

  // For SNIPE mode: try for 10 seconds. For WATCH mode: single attempt per cron tick.
  const deadline = isWatch ? Date.now() + 1_000 : Date.now() + 10_000
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
        await prisma.snipeAttempt.create({ data: { targetId: target.id, success: true, slot } })

        if (target.notificationEmail) {
          const time = slot.split(" ")[1]?.substring(0, 5) ?? ""
          await sendBookingSuccess({
            to: target.notificationEmail,
            restaurantName: target.venueName,
            date: dateStr,
            time,
            partySize: target.partySize,
          }).catch(() => {})
        }
        return { success: true, slot }
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
    }

    if (!isWatch) await new Promise((r) => setTimeout(r, 500))
    else break
  }

  // WATCH mode: no slot this tick — stay WATCHING, log attempt silently
  if (isWatch) {
    await prisma.snipeAttempt.create({
      data: { targetId: target.id, success: false, error: "No slots this check" },
    })
    return { success: false, watching: true }
  }

  // SNIPE mode: failed after 10s window — auto-fallback to Watch mode
  const reservationDate = new Date(target.date)
  const stillFuture = reservationDate > new Date()

  await prisma.reservationTarget.update({
    where: { id: target.id },
    data: {
      status: stillFuture ? "WATCHING" : "FAILED",
      mode: stillFuture ? "WATCH" : "SNIPE",
      lastAttemptAt: new Date(),
    },
  })
  await prisma.snipeAttempt.create({
    data: { targetId: target.id, success: false, error: lastError || "No matching slots at release — watching for cancellations" },
  })

  if (target.notificationEmail && !stillFuture) {
    await sendBookingFailed({
      to: target.notificationEmail,
      restaurantName: target.venueName,
      date: dateStr,
      error: lastError || "No matching slots in your preferred time range",
    }).catch(() => {})
  }

  return { success: false, fallbackToWatch: stillFuture, error: lastError }
}
