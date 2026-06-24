import { NextRequest, NextResponse } from "next/server"

// Fetches an OpenTable restaurant page and extracts the venue ID + metadata
// from the embedded __NEXT_DATA__ JSON. Handles both URL formats:
//   /the-odeon  (slug-only)
//   /r/gjelina-new-york  (r/ prefix)
export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url required" }, { status: 400 })
  }

  // Extract just the path from whatever the user pasted
  let path: string
  try {
    const parsed = new URL(url)
    path = parsed.pathname // e.g. "/the-odeon" or "/r/gjelina-new-york"
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
  }

  const pageUrl = `https://www.opentable.com${path}`

  try {
    const res = await fetch(pageUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        referer: "https://www.opentable.com/",
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `OT page returned ${res.status}` }, { status: 400 })
    }

    const html = await res.text()

    // Try __NEXT_DATA__ first — most reliable
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1])
        const props = nextData?.props?.pageProps
        // Different page shapes — try several known paths
        const restaurant =
          props?.restaurant ??
          props?.initialData?.restaurant ??
          props?.restaurantDetails ??
          nextData?.props?.initialProps?.pageProps?.restaurant
        if (restaurant?.rid || restaurant?.id) {
          return NextResponse.json({
            id: restaurant.rid ?? restaurant.id,
            name: restaurant.name ?? "Unknown",
            neighborhood: restaurant.neighborhoodName ?? restaurant.neighborhood?.name ?? "NYC",
            cuisine: restaurant.primaryCuisine ?? restaurant.cuisines?.[0]?.name ?? "",
          })
        }
      } catch { /* fall through to regex */ }
    }

    // Fallback: grep for "rid":\d+ or "restaurantId":\d+ in the HTML
    const ridMatch =
      html.match(/"rid"\s*:\s*(\d+)/) ??
      html.match(/"restaurantId"\s*:\s*(\d+)/) ??
      html.match(/"id"\s*:\s*(\d+)/)
    const nameMatch = html.match(/<title>([^<|]+)/)

    if (ridMatch) {
      return NextResponse.json({
        id: parseInt(ridMatch[1], 10),
        name: nameMatch?.[1]?.trim() ?? "Unknown",
        neighborhood: "NYC",
        cuisine: "",
      })
    }

    return NextResponse.json({ error: "Could not find restaurant ID on that page" }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
