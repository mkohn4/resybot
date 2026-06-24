import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/crypto"
import { fetchOTUserProfile } from "@/lib/opentable"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = await prisma.oTGuestProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ profile: null })

  return NextResponse.json({
    profile: {
      firstName: profile.firstName,
      lastName: profile.encryptedLastName ? decrypt(profile.encryptedLastName) : "",
      phone: profile.encryptedPhone ? decrypt(profile.encryptedPhone) : "",
      gpid: profile.gpid,
      customerId: profile.customerId,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { bearerToken } = await req.json()
  if (!bearerToken) return NextResponse.json({ error: "bearerToken is required" }, { status: 400 })

  // Fetch profile from OT mobile API to get name/phone/gpid/customerId
  let otUser
  try {
    otUser = await fetchOTUserProfile(bearerToken)
  } catch (err) {
    return NextResponse.json(
      { error: `Could not fetch OpenTable profile: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    )
  }
  if (!otUser || !otUser.gpid) {
    return NextResponse.json({ error: "Invalid bearer token — could not retrieve profile" }, { status: 400 })
  }

  const profile = await prisma.oTGuestProfile.upsert({
    where: { userId: session.user.id },
    update: {
      firstName: otUser.firstName,
      encryptedLastName: encrypt(otUser.lastName),
      encryptedPhone: encrypt(otUser.phone),
      encryptedBearerToken: encrypt(bearerToken),
      gpid: otUser.gpid,
      customerId: otUser.customerId,
    },
    create: {
      userId: session.user.id,
      firstName: otUser.firstName,
      encryptedLastName: encrypt(otUser.lastName),
      encryptedPhone: encrypt(otUser.phone),
      encryptedBearerToken: encrypt(bearerToken),
      gpid: otUser.gpid,
      customerId: otUser.customerId,
    },
  })

  return NextResponse.json({
    profile: {
      firstName: profile.firstName,
      lastName: decrypt(profile.encryptedLastName),
      phone: decrypt(profile.encryptedPhone),
      gpid: profile.gpid,
      customerId: profile.customerId,
    },
  })
}

// Internal helper — decrypts bearer token for use in booking flows
export async function getDecryptedBearerToken(userId: string): Promise<string | null> {
  const profile = await prisma.oTGuestProfile.findUnique({ where: { userId } })
  if (!profile?.encryptedBearerToken) return null
  return decrypt(profile.encryptedBearerToken)
}
