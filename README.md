# ResyBot

**Live app: [resybot.vercel.app/dashboard](https://resybot.vercel.app/dashboard)**

A self-hosted bot that automatically snipes hard-to-get NYC restaurant reservations on [Resy](https://resy.com) and [OpenTable](https://www.opentable.com) the moment they open. Built with Next.js 16, deployed on Vercel with a 1-minute cron job via [cron-job.org](https://cron-job.org).

## How it works

1. Sign in with Google
2. Connect your Resy account (credentials encrypted with AES-256-GCM) and/or your OpenTable account (Bearer token extracted via [Proxyman](https://proxyman.io))
3. Add a restaurant target — search across Resy and OpenTable from the same search box, platform auto-detected
4. Choose a booking mode:
   - **Scheduled** — bot wakes at a specific time and snipes when reservations open (snipe time auto-suggested per restaurant)
   - **Book Now** — immediately checks for available slots and books one right now
   - **Watch** — polls every minute for cancellations and books the moment one appears
5. The bot finds the best slot in your preferred time window, books it, and emails you

## Features

- **Resy + OpenTable** — snipe on both platforms from one interface; platform auto-detected per restaurant
- **Google OAuth** login — no passwords to manage
- **Encrypted credential storage** — Resy email/password and OT Bearer token stored with AES-256-GCM
- **Curated NYC restaurant list** — 27 top Resy restaurants pre-loaded with known release times (Carbone, Lilia, Don Angie, 4 Charles, Atomix, Le Bernardin, and more)
- **Auto-suggested snipe times** — the UI calculates the right moment based on each restaurant's drop schedule
- **Smart slot selection** — prefers indoor seating, tries times in your priority order (8–8:30pm first, then 7:30–9pm), falls back gracefully
- **10-second snipe window** — polls for 10 seconds around the release time for maximum chance of success
- **Watch mode** — polls every minute for cancellations on fully-booked restaurants
- **Auto-fallback** — a missed SNIPE automatically switches to Watch mode rather than failing
- **Email notifications** — success or failure emails via Resend (free tier)
- **Multiple targets** — watch any number of restaurants simultaneously
- **Venue lookup tool** — search Resy and OpenTable restaurants by name in one place
- **Light/dark theme** — persisted via localStorage, no flash on load
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

## Resy curated restaurants

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

### Connecting OpenTable

OpenTable uses a Bearer token from the iOS app rather than a username/password. To get yours:

1. Install [Proxyman](https://proxyman.io) on your iPhone (free tier works)
2. Enable SSL proxying for `mobile-api.opentable.com`
3. Open the OpenTable app and browse any restaurant
4. Export a HAR file and find a request with `Authorization: Bearer <token>`
5. Paste the token into ResyBot via **Connect OT** on the dashboard — it auto-fetches your name, phone, and loyalty ID

The token is long-lived (weeks to months). If OT booking starts failing with an auth error, reconnect with a fresh token.

## Finding a Venue ID

Use the built-in **Venue Lookup** tool (top-right on the dashboard) to search any restaurant by name across both Resy and OpenTable.

## Security notes

- Resy credentials and OT Bearer tokens are encrypted with AES-256-GCM before hitting the database — the encryption key never leaves your server environment
- The cron endpoint is protected by a `CRON_SECRET` bearer token
- The dashboard requires Google authentication — only your account can access it
- No credentials are ever logged or returned to the frontend in plaintext

## License

MIT
