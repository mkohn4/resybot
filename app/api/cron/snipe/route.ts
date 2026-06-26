import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { decrypt, encrypt } from "@/lib/crypto"
import { resyLogin, findSlots, pickBestSlot, bookSlot } from "@/lib/resy"
import { findOTSlots, pickBestOTSlot, bookOTSlot, OTOverlapError, OTAuthError } from "@/lib/opentable"
import { sendBookingSuccess, sendBookingFailed } from "@/lib/notify"

// Worst case: ~55s pre-warm sleep + ~30s polling window. Set generously
// above that so Vercel never kills the function mid-snipe.
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const now = new Date()
    const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000)
    // Look 65s ahead so the tick before a snipe picks it up and sleeps into position
    const lookAhead = new Date(now.getTime() + 65 * 1000)

    // Reset any SNIPING targets whose function crashed mid-sleep (stuck >5 min past snipeAt)
    const recovered = await prisma.reservationTarget.updateMany({
      where: { status: "SNIPING", snipeAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
      data: { status: "WATCHING", mode: "WATCH" },
    })
    if (recovered.count > 0) console.error("[cron] recovered stuck SNIPING targets", { count: recovered.count })

    // Atomically claim SNIPE targets: PENDING → SNIPING in a single UPDATE...RETURNING
    // Prevents concurrent cron invocations from double-processing the same target
    type RawTarget = {
      id: string; userId: string; platform: string; venueId: number; venueName: string
      date: Date; snipeAt: Date | null; partySize: number; preferredTimes: string[]
      mode: string; status: string; notificationEmail: string | null
      lastAttemptAt: Date | null; bookedSlot: string | null
    }
    const snipeTargets = await prisma.$queryRaw<RawTarget[]>`
      UPDATE "ReservationTarget"
      SET status = 'SNIPING'
      WHERE status = 'PENDING'
        AND mode = 'SNIPE'
        AND "snipeAt" >= ${twoMinsAgo}
        AND "snipeAt" <= ${lookAhead}
      RETURNING *
    `
    // For WATCH targets, use a recency guard: skip targets processed in the last 45s
    // to prevent concurrent cron ticks from processing the same target twice
    const watchTargets = await prisma.reservationTarget.findMany({
      where: {
        status: "WATCHING", mode: "WATCH", date: { gte: now },
        OR: [
          { lastAttemptAt: null },
          { lastAttemptAt: { lt: new Date(now.getTime() - 45_000) } },
        ],
      },
    })
    const targets = [...snipeTargets, ...watchTargets]

    // Fetch credentials separately — Neon HTTP adapter doesn't support nested includes
    const userIds = [...new Set(targets.map((t) => t.userId))]
    const [credentials, otProfiles] = userIds.length > 0
      ? await Promise.all([
          prisma.resyCredential.findMany({ where: { userId: { in: userIds } } }),
          prisma.oTGuestProfile.findMany({ where: { userId: { in: userIds } } }),
        ])
      : [[], []]
    const credsByUserId = Object.fromEntries(credentials.map((c) => [c.userId, c]))
    const otProfilesByUserId = Object.fromEntries(otProfiles.map((p) => [p.userId, p]))

    const targetsWithCreds = targets.map((t) => ({
      ...t,
      user: {
        resyCredential: credsByUserId[t.userId] ?? null,
        otGuestProfile: otProfilesByUserId[t.userId] ?? null,
      },
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
  platform: string
  venueId: number
  venueName: string
  date: Date
  snipeAt: Date | null
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
    otGuestProfile: {
      firstName: string
      encryptedLastName: string
      encryptedPhone: string
      encryptedBearerToken: string
      encryptedCardToken: string
      cardLast4: string
      gpid: string
      customerId: string
    } | null
  }
}

export async function processTarget(target: TargetRow) {
  return target.platform === "OPENTABLE"
    ? processOTTarget(target)
    : processResyTarget(target)
}

async function processResyTarget(target: TargetRow) {
  const cred = target.user.resyCredential
  if (!cred) {
    console.error("[cron/resy] no credentials on file", { targetId: target.id, userId: target.userId })
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
        // Don't clobber a good payment method if the refresh login returns none
        paymentMethodId: freshAuth.paymentMethodId ?? cred.paymentMethodId,
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
  }

  const paymentMethodId = cred.paymentMethodId
  if (!paymentMethodId) throw new Error("No payment method on file")

  const dateStr = target.date.toISOString().split("T")[0]
  const isWatch = target.mode === "WATCH"

  await prisma.reservationTarget.update({
    where: { id: target.id },
    data: { status: isWatch ? "WATCHING" : "SNIPING", lastAttemptAt: new Date() },
  })

  // Sleep until snipeAt if we picked it up early (pre-warm window).
  // Cap at 55s to stay within Vercel's 60s function timeout.
  if (!isWatch && target.snipeAt) {
    const waitMs = Math.min(target.snipeAt.getTime() - Date.now(), 55_000)
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
  }

  const deadline = isWatch ? Date.now() + 1_000 : Date.now() + 30_000
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
          await sendBookingSuccess({ to: target.notificationEmail, restaurantName: target.venueName, date: dateStr, time, partySize: target.partySize, platform: "RESY" }).catch((e) => console.error("[notify] email send failed", e))
        }
        return { success: true, slot }
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    if (!isWatch) await new Promise((r) => setTimeout(r, 500))
    else break
  }

  if (isWatch) {
    await prisma.snipeAttempt.create({ data: { targetId: target.id, success: false, error: "No slots this check" } })
    return { success: false, watching: true }
  }

  return fallbackOrFail(target, lastError)
}

async function processOTTarget(target: TargetRow) {
  const profile = target.user.otGuestProfile
  if (!profile) {
    console.error("[cron/ot] no OT profile on file", { targetId: target.id, userId: target.userId })
    await prisma.reservationTarget.update({
      where: { id: target.id },
      data: { status: "FAILED", lastAttemptAt: new Date() },
    })
    throw new Error("No OpenTable guest profile on file — add your name and phone in settings")
  }

  const dateStr = target.date.toISOString().split("T")[0]
  const isWatch = target.mode === "WATCH"

  await prisma.reservationTarget.update({
    where: { id: target.id },
    data: { status: isWatch ? "WATCHING" : "SNIPING", lastAttemptAt: new Date() },
  })

  // Sleep until snipeAt if we picked it up early (pre-warm window).
  // Cap at 55s to stay within Vercel's 60s function timeout.
  if (!isWatch && target.snipeAt) {
    const waitMs = Math.min(target.snipeAt.getTime() - Date.now(), 55_000)
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
  }

  try {
    const deadline = isWatch ? Date.now() + 1_000 : Date.now() + 30_000
    let lastError = ""

    const bearerToken = decrypt(profile.encryptedBearerToken)
    const guestEmail = target.notificationEmail ?? ""
    const skipSlots = new Set<string>()

    while (Date.now() < deadline) {
      try {
        const slots = await findOTSlots(target.venueId, dateStr, target.partySize, bearerToken)
        const best = pickBestOTSlot(slots, target.preferredTimes, skipSlots)

        if (best) {
          try {
            await bookOTSlot(target.venueId, best, target.partySize, {
              firstName: profile.firstName,
              lastName: decrypt(profile.encryptedLastName),
              email: guestEmail,
              phone: decrypt(profile.encryptedPhone),
              gpid: profile.gpid,
              customerId: profile.customerId,
              cardToken: profile.encryptedCardToken ? decrypt(profile.encryptedCardToken) : "",
              cardLast4: profile.cardLast4,
            }, bearerToken)
          } catch (bookErr) {
            if (bookErr instanceof OTOverlapError) {
              skipSlots.add(best.dateTime)
              lastError = bookErr.message
              continue
            }
            throw bookErr
          }
          const slot = best.dateTime
          await prisma.reservationTarget.update({
            where: { id: target.id },
            data: { status: "BOOKED", bookedSlot: slot, lastAttemptAt: new Date() },
          })
          await prisma.snipeAttempt.create({ data: { targetId: target.id, success: true, slot } })
          if (target.notificationEmail) {
            const time = slot.split("T")[1]?.substring(0, 5) ?? ""
            await sendBookingSuccess({ to: target.notificationEmail, restaurantName: target.venueName, date: dateStr, time, partySize: target.partySize, platform: "OPENTABLE" }).catch((e) => console.error("[notify] email send failed", e))
          }
          return { success: true, slot }
        }
      } catch (err: unknown) {
        if (err instanceof OTAuthError) throw err
        lastError = err instanceof Error ? err.message : String(err)
      }
      if (!isWatch) await new Promise((r) => setTimeout(r, 500))
      else break
    }

    if (isWatch) {
      await prisma.snipeAttempt.create({ data: { targetId: target.id, success: false, error: "No slots this check" } })
      return { success: false, watching: true }
    }

    return fallbackOrFail(target, lastError)
  } catch (err: unknown) {
    if (err instanceof OTAuthError) {
      console.error("[cron/ot] auth error — token expired", { targetId: target.id, userId: target.userId })
      await prisma.reservationTarget.update({
        where: { id: target.id },
        data: { status: "FAILED", lastAttemptAt: new Date() },
      })
      await prisma.snipeAttempt.create({
        data: { targetId: target.id, success: false, error: err.message },
      })
      if (target.notificationEmail) {
        await sendBookingFailed({
          to: target.notificationEmail,
          restaurantName: target.venueName,
          date: dateStr,
          error: err.message,
          platform: "OPENTABLE",
        }).catch((e) => console.error("[notify] email send failed", e))
      }
      return { success: false, error: "auth_expired" }
    }
    throw err
  }
}

async function fallbackOrFail(target: TargetRow, lastError: string) {
  const stillFuture = new Date(target.date) > new Date()
  const dateStr = target.date.toISOString().split("T")[0]
  console.error("[cron] snipe missed — fallback", { targetId: target.id, restaurant: target.venueName, error: lastError, stillFuture })

  await prisma.reservationTarget.update({
    where: { id: target.id },
    data: {
      status: stillFuture ? "WATCHING" : "FAILED",
      mode: stillFuture ? "WATCH" : (target.mode as "SNIPE" | "WATCH"),
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
      platform: target.platform,
    }).catch((e) => console.error("[notify] email send failed", e))
  }

  return { success: false, fallbackToWatch: stillFuture, error: lastError }
}
