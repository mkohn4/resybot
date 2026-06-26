import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const target = await prisma.reservationTarget.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.reservationTarget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const target = await prisma.reservationTarget.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  if (body.status !== undefined && body.status !== "CANCELLED") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }
  const updated = await prisma.reservationTarget.update({
    where: { id },
    data: {
      ...(body.status === "CANCELLED" && { status: body.status }),
      ...(body.partySize && { partySize: Number(body.partySize) }),
      ...(body.preferredTimes && { preferredTimes: body.preferredTimes }),
      ...(body.snipeAt && { snipeAt: new Date(body.snipeAt) }),
    },
  })
  return NextResponse.json(updated)
}
