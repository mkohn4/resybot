import type { MetadataRoute } from "next"

// PWA manifest — enables "Add to Home Screen" with the custom icon on iOS/Android
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ResyBot",
    short_name: "ResyBot",
    description: "Auto-snipe NYC restaurant reservations on Resy & OpenTable",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
