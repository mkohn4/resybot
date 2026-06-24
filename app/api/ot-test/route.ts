import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

// Temporary test endpoint — accepts real browser cookies to test
// whether Akamai blocks by IP alone or also by session fingerprint.
// DELETE this route after testing.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { cookieStr, venueId, date, partySize } = await req.json()

  // Extract OT-SessionId to use as CSRF token
  const sessionMatch = cookieStr.match(/OT-SessionId=([^;]+)/)
  const csrfToken = sessionMatch?.[1] ?? ""

  const res = await fetch(
    "https://www.opentable.com/dapi/fe/gql?optype=query&opname=RestaurantsAvailability",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "*/*",
        origin: "https://www.opentable.com",
        referer: "https://www.opentable.com/",
        "x-csrf-token": csrfToken,
        cookie: cookieStr,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        operationName: "RestaurantsAvailability",
        variables: {
          restaurantIds: [venueId ?? 2221],
          date: date ?? "2026-06-28",
          time: "19:00",
          partySize: partySize ?? 2,
          databaseRegion: "NA",
          onlyPop: false,
          forwardDays: 0,
          requireTimes: false,
          requireTypes: [],
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "e6b87021ed6e865a7778aa39d35d09864c1be29c683c707602dd3de43c854d86",
          },
        },
      }),
    }
  )

  const text = await res.text()
  return NextResponse.json({
    status: res.status,
    csrfUsed: csrfToken,
    body: text.length > 500 ? text.substring(0, 500) + "..." : text,
  })
}
