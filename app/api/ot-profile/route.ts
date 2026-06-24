import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const profile = await prisma.oTGuestProfile.findUnique({ where: { userId: session.user.id } })
  return NextResponse.json({ profile })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { firstName, lastName, phone } = await req.json()
  if (!firstName || !lastName || !phone) {
    return NextResponse.json({ error: "firstName, lastName, and phone are required" }, { status: 400 })
  }

  const profile = await prisma.oTGuestProfile.upsert({
    where: { userId: session.user.id },
    update: { firstName, lastName, phone },
    create: { userId: session.user.id, firstName, lastName, phone },
  })

  return NextResponse.json({ profile })
}
