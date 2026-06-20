# ResyBot

A self-hosted bot that automatically snipes hard-to-get NYC restaurant reservations on [Resy](https://resy.com) the moment they open. Built with Next.js 16, deployed on Vercel with a 1-minute cron job.

## How it works

1. Sign in with Google
2. Connect your Resy account (credentials are AES-256-GCM encrypted before storage)
3. Add a restaurant target — search from a curated list of 26 popular NYC spots, or enter any venue ID manually
4. The snipe time is **auto-suggested** based on each restaurant's known reservation release schedule (e.g. midnight ET, 28 days out for Carbone)
5. At the scheduled time, the bot wakes up, finds the best available slot in your preferred 6:30–9pm window, books it, and emails you

## Features

- **Google OAuth** login — no passwords to manage
- **Encrypted credential storage** — Resy email + password stored with AES-256-GCM, auth token refreshed automatically
- **Curated NYC restaurant list** — 26 top restaurants pre-loaded with known release times (Carbone, Lilia, Don Angie, 4 Charles, Atomix, Le Bernardin, and more)
- **Auto-suggested snipe times** — the UI calculates the right moment based on each restaurant's drop schedule
- **Smart slot selection** — prefers indoor seating, tries times in your priority order, falls back gracefully
- **10-second snipe window** — polls the Resy API for 10 seconds around the release time for maximum chance of success
- **Email notifications** — success or failure emails via Resend (free tier)
- **Multiple targets** — watch any number of restaurants simultaneously
- **Attempt history** — see every booking attempt per target in the dashboard

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth | NextAuth v5 + Google OAuth |
| Database | Neon Postgres (Prisma 7) |
| Encryption | Node.js `crypto` — AES-256-GCM |
| Email | Resend |
| Scheduling | Vercel Cron (every 1 minute) |
| Styling | Tailwind CSS |

## Curated restaurants

Pre-loaded with release time data for: Carbone, Don Angie, Lilia, 4 Charles Prime Rib, Rezdôra, Atomix, Jua, Torrisi, Frenchette, Le Bernardin, Laser Wolf, Gage & Tollner, Gramercy Tavern, Eleven Madison Park, The Grill, Nobu, Balthazar, Le Coucou, Dirty French, Crown Shy, Estela, Cosme, L'Artusi, Daniel, Jean-Georges, Ci Siamo, Momofuku Ko.

## Setup

### 1. Prerequisites

- Node.js 20+
- A [Vercel](https://vercel.com) account
- A [Neon](https://neon.tech) Postgres database (free tier, available via Vercel Marketplace)
- A [Google Cloud](https://console.cloud.google.com) project with OAuth 2.0 credentials
- A [Resend](https://resend.com) account for email (free tier: 3,000 emails/month)

### 2. Clone and install

```bash
git clone https://github.com/mkohn4/resybot.git
cd resybot
npm install
```

### 3. Generate secrets

```bash
openssl rand -hex 32   # use for NEXTAUTH_SECRET
openssl rand -hex 32   # use for ENCRYPTION_KEY
openssl rand -hex 16   # use for CRON_SECRET
```

### 4. Configure environment

Copy `.env.local` and fill in all values:

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

Google OAuth redirect URI to add: `https://your-domain.vercel.app/api/auth/callback/google`

### 5. Run migrations

```bash
npx prisma migrate dev --name init
```

### 6. Deploy

```bash
vercel --prod
```

Add all env vars in Vercel → Project → Settings → Environment Variables. The cron job is configured automatically via `vercel.json`.

### 7. Local development

```bash
npm run dev
```

## Finding a Venue ID

If a restaurant isn't in the curated list:

1. Go to `resy.com` and navigate to the restaurant
2. Open browser DevTools → Network tab
3. Look for a request to `api.resy.com/4/find`
4. The `venue_id` query parameter is the number you need

## Security notes

- Resy credentials are encrypted with AES-256-GCM before hitting the database — the encryption key never leaves your server environment
- The cron endpoint is protected by a `CRON_SECRET` bearer token
- The dashboard requires Google authentication — only your account can access it
- No credentials are ever logged or returned to the frontend in plaintext

## License

MIT
