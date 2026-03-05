'use client'

import { useEffect, useState } from 'react'
import { PhoneOff, Phone, PhoneCall, Mail } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils'

type ScreenedCallRow = {
  id: string
  callerPhone: string
  result: string
  createdAt: string
}

type ScreenedCallsResponse = {
  stats: { blocked: number; passed: number; total: number; days: number }
  recentCalls: ScreenedCallRow[]
}

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

export function SpamOnlyDashboard() {
  const [screened, setScreened] = useState<ScreenedCallsResponse | null>(null)
  const [voicemails, setVoicemails] = useState<VoicemailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetch('/api/dashboard/screened-calls?days=30').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Screened calls failed')))),
      fetch('/api/dashboard/voicemails').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Voicemails failed')))),
    ])
      .then(([screenedData, voicemailsData]: [ScreenedCallsResponse, VoicemailsResponse]) => {
        if (!cancelled) {
          setScreened(screenedData)
          setVoicemails(voicemailsData.voicemails ?? [])
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load data')
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
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Call activity and voicemails</p>
        </div>
        <div className="flex items-center justify-center py-16">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Call activity and voicemails</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          {error}
        </div>
      </div>
    )
  }

  const stats = screened?.stats ?? { blocked: 0, passed: 0, total: 0, days: 30 }
  const recentCalls = screened?.recentCalls ?? []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Call activity and voicemails from the last 30 days.</p>
      </div>

      {/* Call Activity - two stat cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Call Activity</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Calls Blocked (Spam)</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.blocked}</p>
                <p className="text-sm text-gray-500 mt-1">Last {stats.days} days</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50">
                <PhoneOff className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Calls Passed (Real Callers)</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.passed}</p>
                <p className="text-sm text-gray-500 mt-1">Last {stats.days} days</p>
              </div>
              <div className="p-3 rounded-lg bg-green-50">
                <Phone className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Calls table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center">
          <PhoneCall className="h-5 w-5 text-blue-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Recent Calls</h2>
        </div>
        {recentCalls.length === 0 ? (
          <div className="p-6 text-center py-12">
            <PhoneCall className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No screened calls in the last 30 days</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Caller Phone</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Date / Time</th>
                  <th className="text-left px-6 py-3 text-gray-600 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 font-mono text-gray-900">{formatPhoneNumber(call.callerPhone)}</td>
                    <td className="px-6 py-3 text-gray-600">{new Date(call.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-3">
                      <span
                        className={
                          call.result === 'passed'
                            ? 'text-green-600 font-medium'
                            : 'text-red-600 font-medium'
                        }
                      >
                        {call.result === 'passed' ? 'Passed' : 'Blocked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Voicemails */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center">
          <Mail className="h-5 w-5 text-purple-600 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Voicemails</h2>
        </div>
        {voicemails.length === 0 ? (
          <div className="p-6 text-center py-12">
            <Mail className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No voicemails yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {voicemails.map((vm) => (
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
