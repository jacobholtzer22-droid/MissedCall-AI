'use client'

import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
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
                <p className="text-sm text-gray-500">{new Date(vm.createdAt).toLocaleString()}</p>
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
