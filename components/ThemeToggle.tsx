"use client"

import { useEffect, useState } from "react"

export function ThemeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    if (next) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("theme", "dark")
    } else {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${dark ? "bg-gray-600" : "bg-gray-300"}`}
    >
      <span
        style={{ backgroundColor: dark ? "#1f2937" : "#fff" }}
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full shadow transition-transform duration-200 text-[10px] ${dark ? "translate-x-6" : "translate-x-1"}`}
      >
        {dark ? "🌙" : "☀️"}
      </span>
    </button>
  )
}
