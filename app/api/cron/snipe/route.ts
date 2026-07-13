import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { decrypt, encrypt } from "@/lib/crypto"
import { resyLogin, findSlots, pickBestSlot, bookSlot } from "@/lib/resy"
import { findOTSlots, pickBestOTSlot, bookOTSlot, OTOverlapError, OTAuthError } from "@/lib/opentable"
import { sendBookingSuccess, sendBookingFailed } from "@/lib/notify"
import { flagOTTokenExpired } from "@/lib/otAuth"

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
      date: Date; dateEnd: Date | null; snipeAt: Date | null; partySize: number; preferredTimes: string[]
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
    // For WATCH targets, use a 20s recency guard. This prevents two near-simultaneous
    // cron invocations from processing the same target twice, while being short enough
    // that a second cron offset by ~30s can still poll watch targets every ~30s
    // (rather than blocking it for a full minute). A watch poll takes ~1-2s, so 20s
    // comfortably exceeds any real overlap window.
    const watchTargets = await prisma.reservationTarget.findMany({
      where: {
        status: "WATCHING", mode: "WATCH",
        AND: [
          // Still live if the effective end (dateEnd for a range, else date) hasn't passed
          { OR: [{ dateEnd: null, date: { gte: now } }, { dateEnd: { gte: now } }] },
          { OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(now.getTime() - 20_000) } }] },
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

    // Auto-expire WATCH targets whose effective end has passed (dateEnd for a
    // range watch, else the single date)
    await prisma.reservationTarget.updateMany({
      where: {
        mode: "WATCH", status: "WATCHING",
        OR: [{ dateEnd: null, date: { lt: now } }, { dateEnd: { lt: now } }],
      },
      data: { status: "FAILED" },
    })

    // Daily cleanup (first cron tick of UTC hour 0). Runs once/day to avoid
    // adding DB work to every tick.
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 2) {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      await prisma.reservationTarget.deleteMany({
        where: {
          status: { in: ["BOOKED", "FAILED", "CANCELLED"] },
          date: { lt: sevenDaysAgo },
        },
      })
      // Prune SnipeAttempt diagnostic rows older than 48h. These are per-tick
      // watch/snipe logs — for an active watch they accumulate ~1440/day forever
      // and are only useful for recent debugging. The 7-day target cleanup above
      // never touches attempts for *active* watches (their target still exists),
      // so without this the table grows unbounded (was 34 MB / 116k rows).
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000)
      const pruned = await prisma.snipeAttempt.deleteMany({
        where: { attemptAt: { lt: fortyEightHoursAgo } },
      })
      if (pruned.count > 0) console.log("[cron] pruned old SnipeAttempt rows", { count: pruned.count })
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
  dateEnd: Date | null
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

// Max span (in days *between* start and end) allowed for a watch range. Aug 2 →
// Aug 16 is a span of 14 = 15 inclusive days. Bounds per-tick API calls (see the
// single-IP scaling note). Shared with POST /api/targets validation so the limit
// that's enforced matches the limit that's actually checked.
export const MAX_WATCH_SPAN_DAYS = 14

// WATCH targets may span a date range (target.date → target.dateEnd inclusive).
// Returns the YYYY-MM-DD strings to check this tick: every day from today (past
// days can't be booked) through the range end, chronological so the earliest
// bookable day wins. dateEnd null → single-day watch.
export function watchDateStrings(target: { date: Date; dateEnd: Date | null }): string[] {
  const startStr = target.date.toISOString().split("T")[0]
  const endStr = (target.dateEnd ?? target.date).toISOString().split("T")[0]
  const todayStr = new Date().toISOString().split("T")[0]
  const fromStr = startStr < todayStr ? todayStr : startStr
  const dates: string[] = []
  let cur = new Date(`${fromStr}T00:00:00Z`)
  const end = new Date(`${endStr}T00:00:00Z`)
  // +1: a span of N days is N+1 inclusive calendar days
  while (cur <= end && dates.length < MAX_WATCH_SPAN_DAYS + 1) {
    dates.push(cur.toISOString().split("T")[0])
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000)
  }
  return dates
}

// Diagnostic: turn the raw slot list into a compact "HH:MM" summary so a miss
// records exactly what the API offered (vs. just "no slots"). Capped to keep the
// SnipeAttempt.error field reasonable.
function summarizeTimes(times: string[]): string {
  if (times.length === 0) return "API returned 0 slots"
  const uniq = [...new Set(times)].sort()
  const shown = uniq.slice(0, 24)
  const more = uniq.length > shown.length ? ` +${uniq.length - shown.length} more` : ""
  return `API offered: ${shown.join(", ")}${more}`
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

  // Sleep until snipeAt if we picked it up early (pre-warm window). The claim
  // window is 65s, so the wait is never more than ~65s; cap at 110s as a safety
  // bound under the 120s maxDuration (leaves room for the 30s polling window).
  if (!isWatch && target.snipeAt) {
    const waitMs = Math.min(target.snipeAt.getTime() - Date.now(), 110_000)
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
  }

  let lastError = ""
  let lastSeen = ""  // diagnostic: times the API returned on the last check

  const bookResyDay = async (day: string, best: NonNullable<ReturnType<typeof pickBestSlot>>) => {
    await bookSlot(authToken, paymentMethodId, best.config.token, day, target.partySize)
    const slot = best.date.start
    await prisma.reservationTarget.update({
      where: { id: target.id },
      data: { status: "BOOKED", bookedSlot: slot, lastAttemptAt: new Date() },
    })
    await prisma.snipeAttempt.create({ data: { targetId: target.id, success: true, slot } })
    if (target.notificationEmail) {
      const time = slot.split(" ")[1]?.substring(0, 5) ?? ""
      await sendBookingSuccess({ to: target.notificationEmail, restaurantName: target.venueName, date: day, time, partySize: target.partySize, platform: "RESY" }).catch((e) => console.error("[notify] email send failed", e))
    }
    return { success: true, slot }
  }

  if (isWatch) {
    // Watch each day in the range (single day if no dateEnd). First day with a
    // matching preferred time gets booked and the whole target is done.
    for (const day of watchDateStrings(target)) {
      try {
        const slots = await findSlots(target.venueId, day, target.partySize, authToken)
        lastSeen = summarizeTimes(slots.map((s) => s.date.start.split(" ")[1]?.substring(0, 5) ?? "").filter(Boolean))
        const best = pickBestSlot(slots, target.preferredTimes, day)
        if (best) return await bookResyDay(day, best)
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
    await prisma.snipeAttempt.create({ data: { targetId: target.id, success: false, error: lastSeen || lastError || "No slots this check" } })
    return { success: false, watching: true }
  }

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const slots = await findSlots(target.venueId, dateStr, target.partySize, authToken)
      lastSeen = summarizeTimes(slots.map((s) => s.date.start.split(" ")[1]?.substring(0, 5) ?? "").filter(Boolean))
      const best = pickBestSlot(slots, target.preferredTimes, dateStr)
      if (best) return await bookResyDay(dateStr, best)
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  return fallbackOrFail(target, lastError || lastSeen)
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

  // Sleep until snipeAt if we picked it up early (pre-warm window). The claim
  // window is 65s, so the wait is never more than ~65s; cap at 110s as a safety
  // bound under the 120s maxDuration (leaves room for the 30s polling window).
  if (!isWatch && target.snipeAt) {
    const waitMs = Math.min(target.snipeAt.getTime() - Date.now(), 110_000)
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs))
  }

  try {
    let lastError = ""

    const bearerToken = decrypt(profile.encryptedBearerToken)
    const guestEmail = target.notificationEmail ?? ""
    const skipSlots = new Set<string>()
    let lastSeen = ""  // diagnostic: times the API returned on the last check

    const finalizeOTBook = async (day: string, slot: string) => {
      await prisma.reservationTarget.update({
        where: { id: target.id },
        data: { status: "BOOKED", bookedSlot: slot, lastAttemptAt: new Date() },
      })
      await prisma.snipeAttempt.create({ data: { targetId: target.id, success: true, slot } })
      if (target.notificationEmail) {
        const time = slot.split("T")[1]?.substring(0, 5) ?? ""
        await sendBookingSuccess({ to: target.notificationEmail, restaurantName: target.venueName, date: day, time, partySize: target.partySize, platform: "OPENTABLE" }).catch((e) => console.error("[notify] email send failed", e))
      }
    }

    // Check one day: find slots, book the best matching preferred time. Returns
    // the booked slot string, or null if nothing matched this day. Throws on
    // OTAuthError so the outer handler flags the expired token.
    const checkOTDay = async (day: string): Promise<string | null> => {
      const slots = await findOTSlots(target.venueId, day, target.partySize, bearerToken)
      lastSeen = summarizeTimes(slots.map((s) => s.dateTime.split("T")[1]?.substring(0, 5) ?? "").filter(Boolean))
      const best = pickBestOTSlot(slots, target.preferredTimes, skipSlots)
      if (!best) return null
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
          return null
        }
        throw bookErr
      }
      return best.dateTime
    }

    if (isWatch) {
      // Watch each day in the range (single day if no dateEnd). First day with a
      // matching preferred time gets booked and the whole target is done.
      for (const day of watchDateStrings(target)) {
        try {
          const slot = await checkOTDay(day)
          if (slot) { await finalizeOTBook(day, slot); return { success: true, slot } }
        } catch (err: unknown) {
          if (err instanceof OTAuthError) throw err
          lastError = err instanceof Error ? err.message : String(err)
        }
      }
      await prisma.snipeAttempt.create({ data: { targetId: target.id, success: false, error: lastSeen || lastError || "No slots this check" } })
      return { success: false, watching: true }
    }

    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      try {
        const slot = await checkOTDay(dateStr)
        if (slot) { await finalizeOTBook(dateStr, slot); return { success: true, slot } }
      } catch (err: unknown) {
        if (err instanceof OTAuthError) throw err
        lastError = err instanceof Error ? err.message : String(err)
      }
      await new Promise((r) => setTimeout(r, 500))
    }

    return fallbackOrFail(target, lastError || lastSeen)
  } catch (err: unknown) {
    if (err instanceof OTAuthError) {
      console.error("[cron/ot] auth error — token expired", { targetId: target.id, userId: target.userId })
      // Keep the target alive so it resumes once the user reconnects, instead of
      // marking it FAILED (a token expiry isn't the target's fault). Flag the
      // profile + email the user once (deduped across all their OT targets).
      await prisma.reservationTarget.update({
        where: { id: target.id },
        data: { lastAttemptAt: new Date() },
      })
      await prisma.snipeAttempt.create({
        data: { targetId: target.id, success: false, error: err.message },
      })
      await flagOTTokenExpired(target.userId, target.notificationEmail)
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
