@AGENTS.md

# ResyBot — Claude Code Context

## Project overview

Self-hosted Resy reservation sniper. Users sign in with Google, store their Resy credentials (AES-256-GCM encrypted), and configure targets. A 1-minute cron (cron-job.org) fires `GET /api/cron/snipe` which handles three modes:

- **SNIPE** — fires once in a 2-minute window around `snipeAt`, polls the Resy API for 10 seconds
- **BOOK NOW** — immediate on-demand snipe via `POST /api/targets/[id]/snipe`
- **WATCH** — polls every cron tick for cancellations, stays active until booked or date passes

## Stack

- **Next.js 16** App Router + TypeScript + Tailwind CSS
- **NextAuth v5** with Google OAuth and PrismaAdapter
- **Prisma 7** + Neon Postgres via `PrismaNeonHttp` driver adapter (`@prisma/adapter-neon`)
- **Resend** for email notifications (lazy-instantiated to avoid build-time errors)
- **AES-256-GCM** encryption via Node.js `crypto`

## Key gotchas

- `middleware.ts` is renamed to `proxy.ts` in Next.js 16; export must be `auth as proxy`
- `prisma.config.ts` loads `.env.local` via `config({ path: ".env.local" })` — not `import "dotenv/config"`
- `prisma/schema.prisma` has NO `url = env(...)` in the datasource block; URL is passed via the adapter in `lib/db.ts`
- Build script is `prisma generate && next build` — required for Vercel to generate the Prisma client
- `vercel.json` is `{}` — Hobby plan blocks sub-daily crons; use cron-job.org instead with `Authorization: Bearer <CRON_SECRET>`
- `new Resend()` must be wrapped in a lazy function to avoid build-time throws when `RESEND_API_KEY` isn't set

## Resy API

- Public key: `VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5`
- Login: `POST /3/auth/password`
- Find slots: `GET /4/find`
- Slot details (book token): `GET /3/details`
- Book: `POST /3/book`
- Venue search: `POST /3/venuesearch/search`

## Preferred time priority

Default order (8–8:30pm first, then 7:30–9pm):
`["20:00", "20:15", "20:30", "19:30", "19:45", "20:45", "21:00"]`

Times are tried in array order — NO automatic sort. The UI preserves click order. Patio/outside/outdoor table types are always skipped. Fallback: first non-patio slot in the 6:30pm–9pm window.

## Important files

| File | Purpose |
|---|---|
| `lib/resy.ts` | Resy API client — login, findSlots, pickBestSlot, bookSlot |
| `lib/db.ts` | Prisma client with Neon HTTP adapter |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt |
| `lib/restaurants.ts` | 27 curated NYC restaurants + `suggestSnipeTime()` |
| `lib/notify.ts` | Lazy Resend email notifications |
| `lib/auth.ts` | NextAuth v5 config |
| `app/api/cron/snipe/route.ts` | Cron handler — processes SNIPE + WATCH targets |
| `app/api/targets/[id]/snipe/route.ts` | On-demand immediate snipe |
| `app/api/venues/lookup/route.ts` | Venue search (curated list + Resy API) |
| `components/AddTargetModal.tsx` | Add target UI — Scheduled / Book Now / Watch modes |
| `components/TargetCard.tsx` | Target dashboard card with Try Now / Stop buttons |
| `components/VenueLookup.tsx` | Venue lookup tool with curated sidebar |
| `proxy.ts` | Next.js 16 auth proxy (formerly middleware.ts) |
| `prisma.config.ts` | Loads `.env.local` for Prisma CLI commands |
| `prisma/schema.prisma` | DB schema — User, ResyCredential, ReservationTarget, SnipeAttempt |

## DB enums

```
TargetMode:   SNIPE | WATCH
TargetStatus: PENDING | SNIPING | WATCHING | BOOKED | FAILED | CANCELLED
```

## Cron setup (cron-job.org)

URL: `https://<your-deployment>.vercel.app/api/cron/snipe`
Method: GET
Schedule: every 1 minute
Header: `Authorization: Bearer <CRON_SECRET>`
