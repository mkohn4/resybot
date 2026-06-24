import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { DashboardClient } from "@/components/DashboardClient"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const [targets, credential, otProfile] = await Promise.all([
    prisma.reservationTarget.findMany({
      where: { userId: session.user.id },
      include: { attempts: { orderBy: { attemptAt: "desc" }, take: 3 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.resyCredential.findUnique({ where: { userId: session.user.id } }),
    prisma.oTGuestProfile.findUnique({ where: { userId: session.user.id } }),
  ])

  return (
    <DashboardClient
      user={{ name: session.user.name ?? "", email: session.user.email ?? "", image: session.user.image ?? "" }}
      initialTargets={targets}
      hasCredentials={!!credential}
      hasOTProfile={!!otProfile}
    />
  )
}
