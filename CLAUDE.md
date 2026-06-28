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
- Some restaurants require a credit card hold (`requiresCreditCard: true, creditCardPolicyType: "HOLD"`) — the user's default wallet card (Spreedly token) is fetched during onboarding and stored encrypted; passed as `creditCardLock` in the lock and book requests
- Two-step booking: lock slot → POST reservation (lock expires after ~30s)
- User profile (gpid, customerId, phone, default wallet card) fetched automatically during OT onboarding via `GET /api/v3/user/?loadInvitations=1`

**Endpoints in use:**
- User profile: `GET /api/v3/user/?loadInvitations=1`
- Availability: `GET /api/v3/restaurant/{id}?dateTime=...&partySize=...&availabilityToken=...&allowPop=true&partnerId=84&...`
- Lock: `POST /api/v1/reservation/{restaurantId}/lock`
- Book: `POST /api/v3/reservation/{restaurantId}`
- Search: `PUT /api/v4/personalize/autocompleteInterspersed`

**OT onboarding flow:** User pastes bearer token into OTProfileModal → app calls `POST /api/ot-profile` → fetches `GET /api/v3/user/?loadInvitations=1` → stores encrypted bearer + gpid + customerId + phone + default wallet card (Spreedly token + last4) in `OTGuestProfile`

**Bearer token expiry:** Unknown — likely long-lived (weeks/months). If booking starts failing with 401, user must re-paste a fresh token from Proxyman.

## Community release notes

Shared, user-editable layer on top of the static curated list in `lib/restaurants.ts`. Stored in the `VenueReleaseNote` table, keyed by **normalized name + platform** (`venueNameKey()` — lowercased, whitespace-collapsed) so notes survive Resy venueId churn. Any signed-in user can add/edit a note from the **Add Target modal** (the blue "Release info" box → "Add note"/"Edit").

- **Community overrides curated:** when a note exists, it replaces the displayed `releaseNotes`. If the note also sets `releaseTime`/`daysOut`, those override the static values and feed `suggestSnipeTime()` so the auto-suggested Snipe At recomputes from the corrected drop time. Static `restaurants.ts` is untouched — it still seeds the editor defaults and powers restaurants with no community note.
- `/api/venues/lookup` batch-fetches notes for all results and overlays them (non-fatal try/catch — falls back to static data).
- `releaseTime` validated as `HH:MM` 24h ET; `daysOut` validated 0–365; note text max 1000 chars. Last editor's name/id stored for attribution.

## Preferred time priority

Default order (8–8:30pm first, then 7:30–9pm):
`["20:00", "20:15", "20:30", "19:30", "19:45", "20:45", "21:00"]`

Times are tried in array order — **NO automatic sort**. The UI preserves click order. Patio/outside/outdoor table types are always skipped. **No fallback** — if none of the preferred times have a slot, nothing is booked (fallback was removed to prevent booking unwanted times).

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
| `lib/restaurants.ts` | 27 curated NYC restaurants + `suggestSnipeTime()`. Includes `platform` field — Don Angie is OT-only |
| `lib/notify.ts` | Lazy Resend email notifications |
| `lib/auth.ts` | NextAuth v5 config |
| `app/api/cron/snipe/route.ts` | Cron handler — processes SNIPE + WATCH targets for both platforms, auto-fallback |
| `app/api/targets/[id]/snipe/route.ts` | On-demand immediate snipe with auto-fallback (Resy + OT) |
| `app/api/venues/lookup/route.ts` | Venue search — curated list + Resy live search + OT mobile autocomplete; overlays community release notes |
| `app/api/venues/release-note/route.ts` | GET/POST shared community release notes (keyed by normalized name + platform) |
| `app/api/ot-profile/route.ts` | GET/POST OT profile — stores encrypted bearer + wallet card token; returns `cardLast4` |
| `components/AddTargetModal.tsx` | Add target UI — Scheduled / Book Now / Watch modes; timezone selector (ET/CT/MT/PT); ✕ close button |
| `components/TargetCard.tsx` | Dashboard card — snipe time always displayed in ET |
| `components/OTProfileModal.tsx` | OT onboarding — paste bearer token; ✕ close button |
| `components/CredentialsModal.tsx` | Resy credentials modal — ✕ close button |
| `components/DashboardClient.tsx` | Dashboard shell — avatar dropdown menu (Resy, OT, Lookup, Sign out); dark mode default |
| `components/VenueLookup.tsx` | Venue lookup tool with curated sidebar |
| `proxy.ts` | Next.js 16 auth proxy (formerly middleware.ts) |
| `prisma.config.ts` | Loads `.env.local` for Prisma CLI commands |
| `prisma/schema.prisma` | DB schema — User, ResyCredential, OTGuestProfile, ReservationTarget, SnipeAttempt, VenueReleaseNote |

## Cron setup (cron-job.org)

URL: `https://resybot.vercel.app/api/cron/snipe`
Method: GET
Schedule: every 1 minute
Header: `Authorization: Bearer <CRON_SECRET>`

## OT bookedSlot format

OT stores `bookedSlot` as `"2026-07-10T20:00"` (ISO with `T`). Resy stores it as `"2026-07-10 20:00:00"` (space-separated). Any time display code must handle both — use `split("T")[1] ?? split(" ")[1]` to extract the time portion, and guard against `NaN` from `parseInt`.

## Multi-user scaling ceiling

The cron is a **single Vercel function invocation** that processes ALL users' targets concurrently via `Promise.allSettled` — work is NOT sharded across machines. Implications as user count grows:

- **Fine at small scale (≤~10 users):** data is fully isolated (every query filters by `userId`, per-user encrypted credentials), each user books with their own token, no booking-logic contention. No impact on success rate.
- **Degrades at dozens+ users hitting the same hot drops:**
  - One function instance runs every concurrent SNIPE's pre-warm sleep + 30s/500ms poll loop simultaneously → CPU/memory/event-loop contention can slow or OOM the instance, hurting everyone's snipe timing.
  - All outbound Resy/OT calls share Vercel's egress IP. Hundreds of availability calls/min from one IP is a bot-farm signature → risk of rate-limiting or IP block affecting ALL users. **This is the most dangerous scaling failure.**
  - Two users targeting the same restaurant/time compete with each other; no coordination.
- **Scaling fixes (only if going beyond a handful):** shard the cron across invocations (`/api/cron/snipe?shard=0..N`), and route outbound calls through rotating proxies to avoid the single-IP signature. Not worth doing preemptively.

## SevenRooms — SKIPPED

Tested 2026-06-25. Steps 1–5 (CSRF, widget info, availability, hold, Stripe setup intent) all work with plain fetch. The book endpoint returns `{"errors":["ReCaptcha server-side validation failed."]}` regardless — server-side reCAPTCHA v3 is required and cannot be bypassed without a real browser or a paid captcha-solving service. Most SR restaurants are also on Resy or OpenTable, so not worth the added complexity. No plans to implement.
