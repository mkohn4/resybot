"use client"

import { useState } from "react"

export function OTProfileModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [bearerToken, setBearerToken] = useState("")
  const [preview, setPreview] = useState<{ firstName: string; lastName: string; phone: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSave() {
    const token = bearerToken.trim()
    if (!token) {
      setError("Paste your OpenTable Bearer token to continue")
      return
    }
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/ot-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bearerToken: token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to save")
      setPreview(data.profile)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-md shadow-2xl my-4">
        <h2 className="text-lg font-bold text-white mb-1">Connect OpenTable</h2>
        <p className="text-gray-500 text-xs mb-5">
          Paste your Bearer token from the OpenTable app. We&apos;ll fetch your profile automatically.
        </p>

        <div className="bg-gray-800/60 rounded-xl p-4 mb-5 text-xs text-gray-400 space-y-1.5 border border-gray-700">
          <p className="font-medium text-gray-300">How to get your Bearer token:</p>
          <p>1. Install <span className="text-white">Proxyman</span> on your iPhone (App Store)</p>
          <p>2. Start a capture session, open the <span className="text-white">OpenTable app</span></p>
          <p>3. Browse any restaurant</p>
          <p>4. In Proxyman, find any request to <span className="text-blue-400">mobile-api.opentable.com</span></p>
          <p>5. Copy the value after <span className="text-blue-400">Authorization: Bearer </span></p>
        </div>

        <div className="mb-5">
          <label className="text-sm text-gray-400 mb-1.5 block">Bearer token</label>
          <textarea
            value={bearerToken}
            onChange={(e) => setBearerToken(e.target.value)}
            placeholder="bc53363e-8e84-4941-8d3c-..."
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 text-sm font-mono resize-none"
          />
        </div>

        {preview && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-4 text-sm">
            <p className="text-emerald-400 font-medium">Connected as {preview.firstName} {preview.lastName}</p>
            <p className="text-emerald-400/70 text-xs mt-0.5">{preview.phone}</p>
          </div>
        )}

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
            disabled={loading || !bearerToken.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  )
}
