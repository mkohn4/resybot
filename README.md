# ResyBot

A self-hosted bot that automatically snipes hard-to-get NYC restaurant reservations on [Resy](https://resy.com) the moment they open. Built with Next.js 16, deployed on Vercel with a 1-minute cron job via [cron-job.org](https://cron-job.org).

## How it works

1. Sign in with Google
2. Connect your Resy account (credentials are AES-256-GCM encrypted before storage)
3. Add a restaurant target — search from a curated list of 27 popular NYC spots, or enter any venue ID manually
4. Choose a booking mode:
   - **Scheduled** — bot wakes at a specific time and snipes when reservations open (snipe time auto-suggested per restaurant)
   - **Book Now** — immediately checks for available slots and books one right now
   - **Watch** — polls every minute for cancellations and books the moment one appears
5. The bot finds the best slot in your preferred time window, books it, and emails you

## Features

- **Google OAuth** login — no passwords to manage
- **Encrypted credential storage** — Resy email + password stored with AES-256-GCM, auth token refreshed automatically
- **Curated NYC restaurant list** — 27 top restaurants pre-loaded with known release times (Carbone, Lilia, Don Angie, 4 Charles, Atomix, Le Bernardin, and more)
- **Auto-suggested snipe times** — the UI calculates the right moment based on each restaurant's drop schedule
- **Smart slot selection** — prefers indoor seating, tries times in your priority order (8–8:30pm first, then 7:30–9pm), falls back gracefully
- **10-second snipe window** — polls the Resy API for 10 seconds around the release time for maximum chance of success
- **Watch mode** — polls every minute for cancellations on fully-booked restaurants
- **Email notifications** — success or failure emails via Resend (free tier)
- **Multiple targets** — watch any number of restaurants simultaneously
- **Venue lookup tool** — search any NYC restaurant by name with a curated sidebar for quick selection
- **Attempt history** — see every booking attempt per target in the dashboard

## Preferred time priority

Default order: **8:00pm → 8:15pm → 8:30pm → 7:30pm → 7:45pm → 8:45pm → 9:00pm**

Times are tried in the order you select them in the UI. Patio/outside/outdoor seating is always skipped.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | NextAuth v5 + Google OAuth |
| Database | Neon Postgres (Prisma 7) |
| Encryption | Node.js `crypto` — AES-256-GCM |
| Email | Resend |
| Scheduling | cron-job.org (every 1 minute) |
| Styling | Tailwind CSS |
| Hosting | Vercel |

## Curated restaurants

Pre-loaded with release time data for: Carbone, Don Angie, Lilia, 4 Charles Prime Rib, Rezdôra, Atomix, Jua, Torrisi, Frenchette, Le Bernardin, Laser Wolf, Gage & Tollner, Gramercy Tavern, Eleven Madison Park, The Grill, Nobu, Balthazar, Le Coucou, Dirty French, Crown Shy, Estela, Cosme, L'Artusi, Daniel, Jean-Georges, Ci Siamo, Momofuku Ko.

## Setup

See [SETUP.md](./SETUP.md) for the full step-by-step guide.

### Quick start

```bash
git clone https://github.com/mkohn4/resybot.git
cd resybot
npm install
```

Generate secrets:

```bash
openssl rand -hex 32   # NEXTAUTH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
openssl rand -hex 16   # CRON_SECRET
```

Fill in `.env.local`:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="https://your-domain.vercel.app"
NEXTAUTH_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
RESEND_API_KEY="re_..."
NOTIFICATION_FROM_EMAIL="resybot@yourdomain.com"
ENCRYPTION_KEY="..."   # 64-char hex (32 bytes)
CRON_SECRET="..."
```

Run migrations and deploy:

```bash
npx prisma migrate dev --name init
vercel --prod
```

### Cron setup (cron-job.org)

Vercel Hobby plan only allows daily crons. Instead, set up a free job at [cron-job.org](https://cron-job.org):

- URL: `https://your-deployment.vercel.app/api/cron/snipe`
- Method: GET
- Schedule: every 1 minute
- Header: `Authorization: Bearer <your CRON_SECRET>`

## Finding a Venue ID

Use the built-in **Venue Lookup** tool in the app (top-right on the dashboard) to search any restaurant by name. For manual lookup: go to `resy.com`, open DevTools → Network, look for a request to `api.resy.com/4/find`, and grab the `venue_id` query parameter.

## Security notes

- Resy credentials are encrypted with AES-256-GCM before hitting the database — the encryption key never leaves your server environment
- The cron endpoint is protected by a `CRON_SECRET` bearer token
- The dashboard requires Google authentication — only your account can access it
- No credentials are ever logged or returned to the frontend in plaintext

## License

MIT
