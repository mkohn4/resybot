import { Resend } from "resend"

const FROM = process.env.NOTIFICATION_FROM_EMAIL ?? "resybot@resend.dev"

function resend() {
  return new Resend(process.env.RESEND_API_KEY ?? "placeholder")
}

export async function sendBookingSuccess(opts: {
  to: string
  restaurantName: string
  date: string
  time: string
  partySize: number
  platform?: string
}) {
  const { to, restaurantName, date, time, partySize, platform } = opts
  const account = platform === "OPENTABLE" ? "OpenTable" : "Resy"
  await resend().emails.send({
    from: FROM,
    to,
    subject: `✅ Reservation booked at ${restaurantName}!`,
    html: `
      <h2>Your reservation is confirmed!</h2>
      <p><strong>Restaurant:</strong> ${restaurantName}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Party size:</strong> ${partySize}</p>
      <p>Check your ${account} account for full details.</p>
    `,
  })
}

export async function sendBookingFailed(opts: {
  to: string
  restaurantName: string
  date: string
  error: string
  platform?: string
}) {
  const { to, restaurantName, date, error, platform } = opts
  const isOT = platform === "OPENTABLE"
  await resend().emails.send({
    from: FROM,
    to,
    subject: `❌ Could not book ${restaurantName}`,
    html: `
      <h2>Reservation attempt failed</h2>
      <p><strong>Restaurant:</strong> ${restaurantName}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Reason:</strong> ${error}</p>
      <p>No slots matched your preferences. You can try again manually on ${isOT ? "OpenTable" : "Resy"}.</p>
    `,
  })
}

// Sent once when the OpenTable bearer token stops working (401).
// Tells the user exactly what to do — recapture and paste a fresh token.
export async function sendOTTokenExpired(opts: { to: string; appUrl?: string }) {
  const { to } = opts
  const appUrl = opts.appUrl ?? process.env.NEXTAUTH_URL ?? "https://resybot.vercel.app"
  await resend().emails.send({
    from: FROM,
    to,
    subject: "⚠️ Your OpenTable connection expired — action needed",
    html: `
      <h2>OpenTable disconnected</h2>
      <p>Your OpenTable bearer token stopped working, so ResyBot has paused all your OpenTable snipes and watches.</p>
      <p><strong>To reconnect:</strong> capture a fresh bearer token from the OpenTable iOS app (Proxyman), then open ResyBot → account menu → <em>Connect OpenTable</em> and paste it in.</p>
      <p><a href="${appUrl}/dashboard">Open ResyBot</a></p>
      <p style="color:#888;font-size:12px">You'll only get this email once per expiry. Your Resy snipes are unaffected.</p>
    `,
  })
}
