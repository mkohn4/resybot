@AGENTS.md

# ResyBot — Claude Code Context

## Project overview

Self-hosted NYC restaurant reservation sniper. Users sign in with Google, store their Resy credentials (AES-256-GCM encrypted) and OpenTable bearer token (AES-256-GCM encrypted). A 1-minute cron (cron-job.org) fires `GET /api/cron/snipe`.

**Three booking modes (both Resy and OpenTable):**
- **SNIPE** — fires once at scheduled `snipeAt` time, polls the API for 10 seconds. On miss, auto-falls back to WATCH mode instead of marking FAILED.
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

## OpenTable API (mobile API — fully working)

Base: `https://mobile-api.opentable.com`
Auth: Bearer token extracted from iOS app via Proxyman HAR capture (no client_id/secret needed)

**Critical implementation details:**
- Slots are at `data.availability.availability.timeslots` — NOT `data.suggestedAvailability` (which is always empty)
- The `availabilityToken` query param MUST be set to `eyJ2IjozLCJtIjowLCJwIjowLCJzIjowLCJuIjowfQ` (base64 of `{"v":3,"m":0,"p":0,"s":0,"n":0}`) — without it, the API returns 0 slots
- The `diningAreaId` in lock/book must come from `slot.diningAreas[0].id` (real ID like `"100618"`), NOT hardcoded `"1"` — using `"1"` causes `NOT_AVAILABLE` from the lock endpoint
- Some restaurants require a credit card hold (`requiresCreditCard: true, creditCardPolicyType: "HOLD"`) — booking those requires a Stripe card token, which we don't currently support; the bot skips them gracefully
- Two-step booking: lock slot → POST reservation (lock expires after ~30s)
- User profile (gpid, customerId, phone) fetched automatically during OT onboarding via `GET /api/v3/user/`

**Endpoints in use:**
- User profile: `GET /api/v3/user/?loadInvitations=0`
- Availability: `GET /api/v3/restaurant/{id}?dateTime=...&partySize=...&availabilityToken=...&allowPop=true&partnerId=84&...`
- Lock: `POST /api/v1/reservation/{restaurantId}/lock`
- Book: `POST /api/v3/reservation/{restaurantId}`
- Search: `PUT /api/v4/personalize/autocompleteInterspersed`

**OT onboarding flow:** User pastes bearer token into OTProfileModal → app calls `POST /api/ot-profile` → fetches `GET /api/v3/user/` → stores encrypted bearer + gpid + customerId + phone in `OTGuestProfile`

**Bearer token expiry:** Unknown — likely long-lived (weeks/months). If booking starts failing with 401, user must re-paste a fresh token from Proxyman.

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
Platform:     RESY | OPENTABLE
```

## Important files

| File | Purpose |
|---|---|
| `lib/resy.ts` | Resy API client — login, findSlots, pickBestSlot, bookSlot |
| `lib/opentable.ts` | OpenTable mobile API client — findOTSlots, pickBestOTSlot, bookOTSlot, searchOTVenues |
| `lib/db.ts` | Prisma client with PrismaNeon WebSocket adapter |
| `lib/crypto.ts` | AES-256-GCM encrypt/decrypt |
| `lib/restaurants.ts` | 27 curated NYC restaurants + `suggestSnipeTime()` |
| `lib/notify.ts` | Lazy Resend email notifications |
| `lib/auth.ts` | NextAuth v5 config |
| `app/api/cron/snipe/route.ts` | Cron handler — processes SNIPE + WATCH targets for both platforms, auto-fallback |
| `app/api/targets/[id]/snipe/route.ts` | On-demand immediate snipe with auto-fallback (Resy + OT) |
| `app/api/venues/lookup/route.ts` | Venue search — curated list + Resy live search + OT mobile autocomplete |
| `app/api/ot-profile/route.ts` | GET/POST OT profile — stores encrypted bearer token, fetches profile from OT API |
| `components/AddTargetModal.tsx` | Add target UI — Scheduled / Book Now / Watch modes, auto-detects Resy vs OT |
| `components/TargetCard.tsx` | Dashboard card — Try Now, Stop, fallback messaging |
| `components/OTProfileModal.tsx` | OT onboarding — paste bearer token, displays fetched name as confirmation |
| `components/VenueLookup.tsx` | Venue lookup tool with curated sidebar |
| `proxy.ts` | Next.js 16 auth proxy (formerly middleware.ts) |
| `prisma.config.ts` | Loads `.env.local` for Prisma CLI commands |
| `prisma/schema.prisma` | DB schema — User, ResyCredential, OTGuestProfile, ReservationTarget, SnipeAttempt |

## Cron setup (cron-job.org)

URL: `https://resybot.vercel.app/api/cron/snipe`
Method: GET
Schedule: every 1 minute
Header: `Authorization: Bearer <CRON_SECRET>`

## Planned: SevenRooms support (Phase 3)

Full plan in memory (`project_sevenrooms_plan.md`). After Resy + OpenTable.

- No consumer login — widget-based per restaurant
- `venue_group_client_id` extractable from DevTools (no mitmproxy needed)
- **Blocked by Cloudflare** — requires Playwright headless browser, not raw fetch
- Poll every 30–60s (slower than Resy)
- Most SevenRooms restaurants are also on Resy, so lower urgency
