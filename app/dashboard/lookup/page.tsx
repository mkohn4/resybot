import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { VenueLookup } from "@/components/VenueLookup"

export default async function LookupPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  return <VenueLookup />
}
