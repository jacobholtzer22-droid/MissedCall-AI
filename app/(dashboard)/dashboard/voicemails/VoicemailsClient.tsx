'use client'

import { useEffect, useState } from 'react'
import { Mail, Trash2 } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils'

type VoicemailRow = {
  conversationId: string
  callerPhone: string
  recordingUrl: string | null
  voicemailTranscription: string | null
  createdAt: string
}

type VoicemailsResponse = {
  voicemails: VoicemailRow[]
}

export function VoicemailsClient() {
  const [voicemails, setVoicemails] = useState<VoicemailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/dashboard/voicemails')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load voicemails'))))
      .then((d: VoicemailsResponse) => {
        if (!cancelled) setVoicemails(d.voicemails ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load voicemails')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete(conversationId: string) {
    if (!window.confirm('Delete this voicemail? This cannot be undone.')) return

    setDeletingId(conversationId)
    try {
      const res = await fetch(`/api/dashboard/voicemails/${conversationId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete voicemail')
      }
      setVoicemails((prev) => prev.filter((vm) => vm.conversationId !== conversationId))
      showToast('Voicemail deleted')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete voicemail')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voicemails</h1>
          <p className="text-gray-500 mt-1">All voicemails left by callers</p>
        </div>
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voicemails</h1>
          <p className="text-gray-500 mt-1">All voicemails left by callers</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Voicemails</h1>
        <p className="text-gray-500 mt-1">All voicemails left by callers, most recent first</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm animate-in fade-in slide-in-from-top-2 duration-200">
          {toast}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {voicemails.length === 0 ? (
          <div className="p-6 text-center py-12">
            <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No voicemails yet</p>
          </div>
        ) : (
          voicemails.map((vm) => (
            <div key={vm.conversationId} className="px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <p className="font-mono font-medium text-gray-900">{formatPhoneNumber(vm.callerPhone)}</p>
                <div className="flex items-center gap-3">
                  <p className="text-sm text-gray-500">{new Date(vm.createdAt).toLocaleString()}</p>
                  <button
                    onClick={() => handleDelete(vm.conversationId)}
                    disabled={deletingId === vm.conversationId}
                    title="Delete voicemail"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {vm.recordingUrl && (
                <div className="mb-2">
                  <audio controls className="w-full max-w-md" src={vm.recordingUrl} preload="metadata">
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}
              {vm.voicemailTranscription && (
                <p className="text-sm text-gray-600 mt-2 p-3 bg-gray-50 rounded-lg">{vm.voicemailTranscription}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
