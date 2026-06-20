import { NextRequest, NextResponse } from "next/server"
import { NYC_RESTAURANTS } from "@/lib/restaurants"

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? ""

  const results = NYC_RESTAURANTS.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.neighborhood.toLowerCase().includes(q) ||
      r.cuisine.toLowerCase().includes(q)
  ).slice(0, 10)

  return NextResponse.json(results)
}
