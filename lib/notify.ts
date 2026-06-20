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
}) {
  const { to, restaurantName, date, time, partySize } = opts
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
      <p>Check your Resy account for full details.</p>
    `,
  })
}

export async function sendBookingFailed(opts: {
  to: string
  restaurantName: string
  date: string
  error: string
}) {
  const { to, restaurantName, date, error } = opts
  await resend().emails.send({
    from: FROM,
    to,
    subject: `❌ Could not book ${restaurantName}`,
    html: `
      <h2>Reservation attempt failed</h2>
      <p><strong>Restaurant:</strong> ${restaurantName}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Reason:</strong> ${error}</p>
      <p>No slots matched your preferences in the sniping window. You can try again manually on Resy.</p>
    `,
  })
}
