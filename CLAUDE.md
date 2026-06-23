@AGENTS.md

# ResyBot — Claude Code Context

## Project overview

Self-hosted NYC restaurant reservation sniper. Users sign in with Google, store their Resy credentials (AES-256-GCM encrypted), and configure targets. A 1-minute cron (cron-job.org) fires `GET /api/cron/snipe`.

**Three booking modes:**
- **SNIPE** — fires once at scheduled `snipeAt` time, polls the Resy API for 10 seconds. On miss, auto-falls back to WATCH mode instead of marking FAILED.
- **WATCH** — polls every cron tick for cancellations, stays WATCHING until booked or date passes.
- **Book Now** — immediate on-demand snipe via `POST /api/targets/[id]/snipe`. On miss, also auto-falls back to WATCH.

## Stack

- **Next.js 16** App Router + TypeScript + Tailwind CSS
- **NextAuth v5** with Google OAuth and PrismaAdapter
- **Prisma 7** + Neon Postgres via `PrismaNeon` WebSocket adapter (`@prisma/adapter-neon`)
- **Resend** for email notifications (lazy-instantiated to avoid build-time errors)
- **AES-256-GCM** encryption via Node.js `crypto`
- **cron-job.org** for 1-minute polling (Vercel Hobby plan blocks sub-daily crons)

## Critical gotchas

- Use `PrismaNeon` (WebSocket), **NOT** `PrismaNeonHttp` — the HTTP adapter doesn't support OR clauses, `updateMany`, nested includes, or anything requiring implicit transactions
- `middleware.ts` is renamed to `proxy.ts` in Next.js 16; export must be `auth as proxy`
- `prisma/schema.prisma` has NO `url = env(...)` in the datasource block; URL is passed via the adapter in `lib/db.ts`
- `prisma.config.ts` loads `.env.local` via `config({ path: ".env.local" })` — NOT `import "dotenv/config"` which only reads `.env`
- Build script is `prisma generate && next build` — required for Vercel to generate the Prisma client
- `vercel.json` is `{}` — Hobby plan blocks sub-daily crons; use cron-job.org with `Authorization: Bearer <CRON_SECRET>`
- `new Resend()` must be wrapped in a lazy function to avoid build-time throws when `RESEND_API_KEY` isn't set
- Nested Prisma `include` (e.g. `user: { include: { resyCredential: true } }`) must be flattened into separate queries even with the WebSocket adapter — use `findUnique`/`findMany` separately

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

Times are tried in array order — **NO automatic sort**. The UI preserves click order. Patio/outside/outdoor table types are always skipped. Fallback: first non-patio slot in the 6:30pm–9pm window.

## Watch mode expiry

Watch targets stop at **noon on the reservation date**. The `date` field is stored as `YYYY-MM-DDT12:00:00` (noon local). The cron only picks up targets where `date >= now`, and auto-expires (marks FAILED) where `date < now`. This gives you the morning of the reservation to make other plans if the bot didn't find anything.

## Auto-fallback behavior

When a SNIPE target misses (no slots found in the 10s window), the cron handler automatically switches it to `mode=WATCH, status=WATCHING` if the reservation date is still in the future. Same applies to on-demand Try Now/Book Now snipes. Only marks FAILED if the reservation date has passed.

## DB enums

```
TargetMode:   SNIPE | WATCH
TargetStatus: PENDING | SNIPING | WATCHING | BOOKED | FAILED | CANCELLED
```

## Important files

| File | Purpose |
|---|---|
| `lib/resy.ts` | Resy API client — login, findSlots, pickBestSlot, bookSlot |
| `lib/db.ts` | Prisma client with PrismaNeon WebSocket adapter |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt |
| `lib/restaurants.ts` | 27 curated NYC restaurants + `suggestSnipeTime()` |
| `lib/notify.ts` | Lazy Resend email notifications |
| `lib/auth.ts` | NextAuth v5 config |
| `app/api/cron/snipe/route.ts` | Cron handler — processes SNIPE + WATCH targets, auto-fallback logic |
| `app/api/targets/[id]/snipe/route.ts` | On-demand immediate snipe with auto-fallback |
| `app/api/venues/lookup/route.ts` | Venue search (curated list + Resy `/3/venuesearch/search`) |
| `components/AddTargetModal.tsx` | Add target UI — Scheduled / Book Now / Watch modes |
| `components/TargetCard.tsx` | Dashboard card — Try Now, Stop, fallback messaging |
| `components/VenueLookup.tsx` | Venue lookup tool with curated sidebar |
| `proxy.ts` | Next.js 16 auth proxy (formerly middleware.ts) |
| `prisma.config.ts` | Loads `.env.local` for Prisma CLI commands |
| `prisma/schema.prisma` | DB schema — User, ResyCredential, ReservationTarget, SnipeAttempt |

## Cron setup (cron-job.org)

URL: `https://resybot.vercel.app/api/cron/snipe`
Method: GET
Schedule: every 1 minute
Header: `Authorization: Bearer <CRON_SECRET>`

## Planned: OpenTable support

Full plan saved in memory (`project_opentable_plan.md`). Phased build:

1. **Schema** — add `Platform` enum (RESY/OPENTABLE) to `ReservationTarget`, new `OpenTableCredential` model
2. **`lib/opentable.ts`** — mirrors `lib/resy.ts`; needs `client_id`/`client_secret` extracted from OpenTable mobile app via mitmproxy first
3. **Credential UI** — Connect Resy / Connect OpenTable tabs
4. **Modal platform toggle** — [Resy][OpenTable] pill at top of AddTargetModal
5. **Cron routing** — `target.platform === "OPENTABLE" ? otFindSlots : resyFindSlots`
6. **Venue lookup** — OpenTable search tab

**Blocker before starting:** Extract OpenTable `client_id`/`client_secret` by intercepting OpenTable mobile app traffic with mitmproxy (jailbroken iPhone + SSL Kill Switch 2 is easiest).

## Planned: SevenRooms support (Phase 3)

Full plan in memory (`project_sevenrooms_plan.md`). After Resy + OpenTable.

- No consumer login — widget-based per restaurant
- `venue_group_client_id` extractable from DevTools (no mitmproxy needed)
- **Blocked by Cloudflare** — requires Playwright headless browser, not raw fetch
- Poll every 30–60s (slower than Resy)
- Most SevenRooms restaurants are also on Resy, so lower urgency
