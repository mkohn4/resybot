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
- **Encrypted credential storage** — Resy email/password, OT Bearer token, and OT wallet card token all stored with AES-256-GCM
- **CC-hold restaurants** — OpenTable restaurants requiring a credit card hold are supported; your saved card is stored during OT onboarding
- **Curated NYC restaurant list** — top NYC restaurants pre-loaded with known release times; includes both Resy and OT entries (e.g. Don Angie is OT-only, 7 days out at 9am)
- **Community release notes** — any user can add or correct a restaurant's release info (note + drop time + days out) from the Add Target modal; shared across all users and overrides the static curated data, so the list improves as drop times change
- **Live availability preview** — in Book Now and Watch modes, the modal checks the venue's current openings and highlights which of your preferred times are bookable right now, plus surfaces any other open times
- **Clickable venue links** — restaurant names on the dashboard link straight to the OpenTable profile (or a prefilled Resy search) for the reservation date and party size
- **Inline target editing** — edit an active target's party size and preferred times right on the card to add or remove slots without recreating it
- **Auto-suggested snipe times** — the UI calculates the right moment based on each restaurant's drop schedule
- **Timezone-aware snipe input** — select ET/CT/MT/PT when scheduling; time is always displayed in ET on the dashboard
- **Strict slot selection** — only books your specified preferred times, in order; no fallback to unselected times. Patio/outdoor seating always skipped
- **10-second snipe window** — polls for 10 seconds around the release time for maximum chance of success
- **Overlap handling** — if a slot fails due to an existing overlapping reservation, the next preferred time is tried automatically
- **Watch mode** — polls every minute for cancellations on fully-booked restaurants
- **Auto-fallback** — a missed SNIPE automatically switches to Watch mode rather than failing
- **Email notifications** — success or failure emails via Resend (free tier)
- **Multiple targets** — watch any number of restaurants simultaneously
- **Venue lookup tool** — search Resy and OpenTable restaurants by name in one place; curated data (release time, days out) shown inline
- **Deduplication** — curated entries and live search results are merged so the same restaurant never appears twice
- **Dark mode default** — app always starts in dark mode
- **Mobile-friendly nav** — all actions (Connect Resy, Connect OT, Venue Lookup, Sign Out) nested under the avatar dropdown
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

Pre-loaded with release time data for 27 top NYC restaurants across Resy and OpenTable:

**Resy:** Carbone, Lilia, 4 Charles Prime Rib, Rezdôra, Atomix, Jua, Torrisi, Frenchette, Le Bernardin, Laser Wolf, Gage & Tollner, Gramercy Tavern, Eleven Madison Park, The Grill, Nobu, Balthazar, Le Coucou, Dirty French, Crown Shy, Estela, Cosme, L'Artusi, Daniel, Jean-Georges, Ci Siamo, Momofuku Ko

**OpenTable:** Don Angie (7 days out, 9am ET)

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
5. Paste the token into ResyBot via **Connect OT** on the dashboard — it auto-fetches your name, phone, loyalty ID, and default saved card (for CC-hold restaurants)

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
