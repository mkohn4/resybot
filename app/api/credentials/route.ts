import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/crypto"
import { resyLogin } from "@/lib/resy"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cred = await prisma.resyCredential.findUnique({ where: { userId: session.user.id } })
  if (!cred) return NextResponse.json({ exists: false })

  return NextResponse.json({
    exists: true,
    email: decrypt(cred.encryptedEmail),
    hasToken: !!cred.encryptedAuthToken,
    paymentMethodId: cred.paymentMethodId,
    tokenExpiresAt: cred.tokenExpiresAt,
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 })

  // Immediately verify credentials by logging in
  let authResult
  try {
    authResult = await resyLogin(email, password)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Login failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await prisma.resyCredential.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      encryptedEmail: encrypt(email),
      encryptedPassword: encrypt(password),
      encryptedAuthToken: encrypt(authResult.token),
      paymentMethodId: authResult.paymentMethodId,
      tokenExpiresAt: tokenExpiry,
    },
    update: {
      encryptedEmail: encrypt(email),
      encryptedPassword: encrypt(password),
      encryptedAuthToken: encrypt(authResult.token),
      paymentMethodId: authResult.paymentMethodId,
      tokenExpiresAt: tokenExpiry,
    },
  })

  return NextResponse.json({ success: true, paymentMethodId: authResult.paymentMethodId })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.resyCredential.deleteMany({ where: { userId: session.user.id } })
  return NextResponse.json({ success: true })
}
