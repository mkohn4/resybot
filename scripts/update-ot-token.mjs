// One-off: store a fresh OpenTable bearer token, mirroring POST /api/ot-profile.
// Usage: node scripts/update-ot-token.mjs <bearerToken> [userEmail]
import { config } from "dotenv"
config({ path: ".env.local" })

import crypto from "crypto"
import { neon } from "@neondatabase/serverless"

const ALGORITHM = "aes-256-gcm", IV_LENGTH = 16
function encrypt(plaintext) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "hex").subarray(0, 32)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64")
}

const bearer = process.argv[2]
const email = process.argv[3]
if (!bearer) { console.error("usage: node scripts/update-ot-token.mjs <bearerToken> [email]"); process.exit(1) }

const res = await fetch("https://mobile-api.opentable.com/api/v3/user/?loadInvitations=1", {
  headers: { Authorization: `Bearer ${bearer}`, "User-Agent": "com.contextoptional.OpenTable/26.18.0.9; iPhone; iOS/26.5; 3.0;" },
})
if (!res.ok) { console.error("token invalid:", res.status); process.exit(1) }
const u = await res.json()
const phone = u?.phoneNumbers?.[0]?.number ?? ""
const card = (u?.wallet?.cards ?? []).find((c) => c.default) ?? u?.wallet?.cards?.[0]

const sql = neon(process.env.DATABASE_URL)
const profiles = email
  ? await sql`SELECT p.id FROM "OTGuestProfile" p JOIN "User" us ON us.id = p."userId" WHERE us.email = ${email}`
  : await sql`SELECT id FROM "OTGuestProfile"`
if (profiles.length !== 1) { console.error(`expected 1 profile, found ${profiles.length}. Pass an email to disambiguate.`); process.exit(1) }
const id = profiles[0].id

await sql`
  UPDATE "OTGuestProfile" SET
    "firstName" = ${u?.firstName ?? ""},
    "encryptedLastName" = ${encrypt(u?.lastName ?? "")},
    "encryptedPhone" = ${encrypt(phone)},
    "encryptedBearerToken" = ${encrypt(bearer)},
    "encryptedCardToken" = ${card?.token ? encrypt(card.token) : ""},
    "cardLast4" = ${card?.last4 ?? ""},
    "gpid" = ${u?.globalPersonId ?? ""},
    "customerId" = ${String(u?.customerId ?? "")},
    "bearerExpiredAt" = NULL,
    "updatedAt" = NOW()
  WHERE id = ${id}`
console.log(`✓ updated OT token for ${u?.firstName} ${u?.lastName} (card •${card?.last4 ?? "none"}), cleared expiry flag`)
