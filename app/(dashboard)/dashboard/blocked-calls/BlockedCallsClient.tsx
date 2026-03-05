'use client'

import { useEffect, useState } from 'react'
import { PhoneOff, Phone } from 'lucide-react'
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

type Filter = 'all' | 'blocked' | 'passed'

export function BlockedCallsClient() {
  const [data, setData] = useState<ScreenedCallsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/dashboard/screened-calls?days=30')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d: ScreenedCallsResponse) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load screened calls')
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
          <h1 className="text-2xl font-bold text-gray-900">Blocked Calls</h1>
          <p className="text-gray-500 mt-1">Screened calls from the last 30 days</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Blocked Calls</h1>
          <p className="text-gray-500 mt-1">Screened calls from the last 30 days</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">{error}</div>
      </div>
    )
  }

  const calls = data?.recentCalls ?? []
  const filtered =
    filter === 'all' ? calls : filter === 'blocked' ? calls.filter((c) => c.result === 'blocked') : calls.filter((c) => c.result === 'passed')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Blocked Calls</h1>
        <p className="text-gray-500 mt-1">Screened calls from the last 30 days</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-gray-700">Show:</span>
        <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('blocked')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition flex items-center gap-1.5 ${filter === 'blocked' ? 'bg-white text-red-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <PhoneOff className="h-4 w-4" />
            Blocked Only
          </button>
          <button
            type="button"
            onClick={() => setFilter('passed')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition flex items-center gap-1.5 ${filter === 'passed' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Phone className="h-4 w-4" />
            Passed Only
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6 text-center py-12">
            <PhoneOff className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {filter === 'all' ? 'No screened calls in the last 30 days' : `No ${filter} calls in the last 30 days`}
            </p>
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
                {filtered.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 font-mono text-gray-900">{formatPhoneNumber(call.callerPhone)}</td>
                    <td className="px-6 py-3 text-gray-600">{new Date(call.createdAt).toLocaleString()}</td>
                    <td className="px-6 py-3">
                      <span
                        className={
                          call.result === 'passed' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
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
    </div>
  )
}
