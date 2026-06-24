"use client"

import { useState } from "react"

export function OTProfileModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSave() {
    if (!firstName || !lastName || !phone) {
      setError("All fields are required")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/ot-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone }),
      })
      if (!res.ok) throw new Error("Failed to save")
      onSaved()
    } catch {
      setError("Failed to save profile")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-md shadow-2xl my-4">
        <h2 className="text-lg font-bold text-white mb-1">OpenTable Guest Profile</h2>
        <p className="text-gray-500 text-xs mb-5">
          Used to complete bookings on OpenTable. No account required — just your name and phone.
        </p>

        <div className="space-y-3 mb-5">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-1.5 block">First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Max"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-1.5 block">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Kohn"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="2125551234"
              type="tel"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  )
}
