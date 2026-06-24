import type { Metadata } from "next"
import { Geist } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const geist = Geist({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "ResyBot",
  description: "Auto-snipe NYC restaurant reservations on Resy",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Runs before paint to avoid flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.classList.add('dark')` }} />
      </head>
      <body className={`${geist.className} bg-gray-950 text-gray-100 antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
