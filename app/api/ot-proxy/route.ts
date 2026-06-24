import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

// Proxies OT API calls server-side to avoid browser CSRF constraints.
// Establishes a fresh OT session first to get valid cookies + CSRF token,
// then forwards the actual request with those credentials.

const OT_BASE = "https://www.opentable.com"

async function getOTSession(): Promise<{ cookies: string; csrfToken: string } | null> {
  try {
    const res = await fetch(`${OT_BASE}/`, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      },
    })
    if (!res.ok) return null

    // Collect all Set-Cookie headers
    const setCookies = res.headers.getSetCookie?.() ?? []
    const cookieStr = setCookies
      .map((c) => c.split(";")[0])
      .join("; ")

    // Extract OT-SessionId to use as CSRF token (double-submit pattern)
    const sessionMatch = cookieStr.match(/OT-SessionId=([^;]+)/)
    const csrfToken = sessionMatch?.[1] ?? crypto.randomUUID()

    return { cookies: cookieStr, csrfToken }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { endpoint, body } = await req.json()
  if (!endpoint || !body) return NextResponse.json({ error: "endpoint and body required" }, { status: 400 })

  // Validate endpoint is an OT URL to prevent SSRF
  if (!endpoint.startsWith("/dapi/")) {
    return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 })
  }

  // Establish a fresh OT session
  const otSession = await getOTSession()
  const csrfToken = otSession?.csrfToken ?? crypto.randomUUID()
  const cookies = otSession?.cookies ?? ""

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "*/*",
    origin: OT_BASE,
    referer: `${OT_BASE}/`,
    "x-csrf-token": csrfToken,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  }
  if (cookies) headers["cookie"] = cookies

  try {
    const otRes = await fetch(`${OT_BASE}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (!otRes.ok) {
      const text = await otRes.text()
      return NextResponse.json({ error: `OT returned ${otRes.status}: ${text}` }, { status: otRes.status })
    }

    const data = await otRes.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
