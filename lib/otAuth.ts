import { prisma } from "@/lib/db"
import { sendOTTokenExpired } from "@/lib/notify"

// Called whenever an OpenTable API call returns 401 (OTAuthError).
// Sets bearerExpiredAt on the user's profile and emails them — but only ONCE
// per expiry. The conditional updateMany (bearerExpiredAt: null) means the very
// first 401 wins and emails; every other target's 401 this cron tick is a no-op.
// The flag is cleared when a fresh token is stored (see ot-profile POST).
export async function flagOTTokenExpired(userId: string, notificationEmail: string | null) {
  const res = await prisma.oTGuestProfile.updateMany({
    where: { userId, bearerExpiredAt: null },
    data: { bearerExpiredAt: new Date() },
  })
  // res.count === 0 means it was already flagged — don't re-send.
  if (res.count > 0 && notificationEmail) {
    await sendOTTokenExpired({ to: notificationEmail }).catch((e) =>
      console.error("[otAuth] expiry email send failed", e)
    )
  }
}
