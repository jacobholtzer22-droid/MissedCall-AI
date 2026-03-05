'use client'

import { useEffect, useState } from 'react'
import { PhoneOff, Phone, PhoneCall, Mail } from 'lucide-react'
import Link from 'next/link'
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

type RecentActivityItem =
  | { type: 'call'; id: string; callerPhone: string; result: string; createdAt: string }
  | { type: 'voicemail'; conversationId: string; callerPhone: string; createdAt: string }

export function SpamOnlyDashboard() {
  const [todayStats, setTodayStats] = useState<ScreenedCallsResponse | null>(null)
  const [recentScreened, setRecentScreened] = useState<ScreenedCallsResponse | null>(null)
  const [voicemails, setVoicemails] = useState<VoicemailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetch('/api/dashboard/screened-calls?days=1').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Today stats failed')))),
      fetch('/api/dashboard/screened-calls?days=30').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Recent calls failed')))),
      fetch('/api/dashboard/voicemails').then((r) => (r.ok ? r.json() : Promise.reject(new Error('Voicemails failed')))),
    ])
      .then(([todayData, recentData, voicemailsData]: [ScreenedCallsResponse, ScreenedCallsResponse, VoicemailsResponse]) => {
        if (!cancelled) {
          setTodayStats(todayData)
          setRecentScreened(recentData)
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

  const today = todayStats?.stats ?? { blocked: 0, passed: 0, total: 0 }
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const voicemailsToday = voicemails.filter((v) => new Date(v.createdAt) >= todayStart).length

  const recentCalls = recentScreened?.recentCalls ?? []
  const activityItems: RecentActivityItem[] = [
    ...recentCalls.map((c) => ({ type: 'call' as const, id: c.id, callerPhone: c.callerPhone, result: c.result, createdAt: c.createdAt })),
    ...voicemails.map((v) => ({ type: 'voicemail' as const, conversationId: v.conversationId, callerPhone: v.callerPhone, createdAt: v.createdAt })),
  ]
  activityItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const recentActivity = activityItems.slice(0, 10)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Today&apos;s call activity and recent activity.</p>
      </div>

      {/* Today stats - 3 cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-700">Calls Blocked Today</p>
              <p className="text-3xl font-bold text-red-900 mt-1">{today.blocked}</p>
            </div>
            <div className="p-3 rounded-lg bg-red-100">
              <PhoneOff className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-700">Calls Passed Today</p>
              <p className="text-3xl font-bold text-green-900 mt-1">{today.passed}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-100">
              <Phone className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Voicemails Today</p>
              <p className="text-3xl font-bold text-blue-900 mt-1">{voicemailsToday}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-100">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity - calls + voicemails combined */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center">
            <PhoneCall className="h-5 w-5 text-blue-600 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/blocked-calls" className="text-sm text-blue-600 hover:text-blue-700">
              View all calls
            </Link>
            <span className="text-gray-300">|</span>
            <Link href="/dashboard/voicemails" className="text-sm text-blue-600 hover:text-blue-700">
              View voicemails
            </Link>
          </div>
        </div>
        {recentActivity.length === 0 ? (
          <div className="p-6 text-center py-12">
            <PhoneCall className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No recent calls or voicemails</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentActivity.map((item) =>
              item.type === 'call' ? (
                <li key={`call-${item.id}`} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <PhoneCall className="h-4 w-4 text-gray-400" />
                    <span className="font-mono text-gray-900">{formatPhoneNumber(item.callerPhone)}</span>
                    <span className={item.result === 'passed' ? 'text-green-600 text-sm font-medium' : 'text-red-600 text-sm font-medium'}>
                      {item.result === 'passed' ? 'Passed' : 'Blocked'}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">{new Date(item.createdAt).toLocaleString()}</span>
                </li>
              ) : (
                <li key={`vm-${item.conversationId}`} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-blue-500" />
                    <span className="font-mono text-gray-900">{formatPhoneNumber(item.callerPhone)}</span>
                    <span className="text-sm text-blue-600 font-medium">Voicemail</span>
                  </div>
                  <span className="text-sm text-gray-500">{new Date(item.createdAt).toLocaleString()}</span>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
