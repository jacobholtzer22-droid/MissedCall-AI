// ===========================================
// CALL SCREENER CARD COMPONENT
// ===========================================
// Path: app/admin/components/CallScreenerCard.tsx
//
// Drop this component into your admin dashboard
// wherever you display per-business settings.
// It shows the toggle + blocked call stats.

'use client'

import { useState, useEffect } from 'react'
import { Shield, ShieldCheck, ShieldX, Phone, PhoneOff } from 'lucide-react'

interface CallScreenerCardProps {
  businessId: string
  businessName: string
  callScreenerEnabled: boolean
  callScreenerMessage?: string | null
  onToggle: (businessId: string, enabled: boolean) => Promise<void>
  onUpdateMessage: (businessId: string, message: string) => Promise<void>
}

interface ScreenerStats {
  blocked: number
  passed: number
  total: number
  blockRate: number
  days: number
}

interface RecentCall {
  id: string
  callerPhone: string
  result: string
  createdAt: string
}

export function CallScreenerCard({
  businessId,
  businessName,
  callScreenerEnabled,
  callScreenerMessage,
  onToggle,
  onUpdateMessage,
}: CallScreenerCardProps) {
  const [enabled, setEnabled] = useState(callScreenerEnabled)
  const [message, setMessage] = useState(
    callScreenerMessage || `Thank you for calling ${businessName}. To be connected, please press 1.`
  )
  const [editingMessage, setEditingMessage] = useState(false)
  const [stats, setStats] = useState<ScreenerStats | null>(null)
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([])
  const [showLog, setShowLog] = useState(false)
  const [toggling, setToggling] = useState(false)

  // Fetch stats when component mounts or screener is enabled
  useEffect(() => {
    if (enabled) {
      fetchStats()
    }
  }, [enabled, businessId])

  async function fetchStats() {
    try {
      const res = await fetch(`/api/admin/businesses/${businessId}/screened-calls?days=30`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
        setRecentCalls(data.recentCalls || [])
      }
    } catch (err) {
      console.error('Failed to fetch screener stats:', err)
    }
  }

  async function handleToggle() {
    setToggling(true)
    const newState = !enabled
    try {
      await onToggle(businessId, newState)
      setEnabled(newState)
      if (newState) fetchStats()
    } catch (err) {
      console.error('Failed to toggle call screener:', err)
    } finally {
      setToggling(false)
    }
  }

  async function handleSaveMessage() {
    try {
      await onUpdateMessage(businessId, message)
      setEditingMessage(false)
    } catch (err) {
      console.error('Failed to update screener message:', err)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${enabled ? 'bg-green-500/10' : 'bg-gray-800'}`}>
            <Shield className={`h-5 w-5 ${enabled ? 'text-green-400' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-white">Call Screener</h3>
            <p className="text-xs text-gray-500">IVR &quot;Press 1&quot; spam filter</p>
          </div>
        </div>

        {/* Toggle switch */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-green-500' : 'bg-gray-700'
          } ${toggling ? 'opacity-50' : ''}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Stats (only when enabled) */}
      {enabled && stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <PhoneOff className="h-3.5 w-3.5 text-red-400" />
            </div>
            <p className="text-xl font-bold text-red-400">{stats.blocked}</p>
            <p className="text-[10px] text-red-400/70 uppercase tracking-wide">Blocked</p>
          </div>
          <div className="bg-green-950/30 border border-green-500/20 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Phone className="h-3.5 w-3.5 text-green-400" />
            </div>
            <p className="text-xl font-bold text-green-400">{stats.passed}</p>
            <p className="text-[10px] text-green-400/70 uppercase tracking-wide">Real Calls</p>
          </div>
          <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <p className="text-xl font-bold text-blue-400">{stats.blockRate}%</p>
            <p className="text-[10px] text-blue-400/70 uppercase tracking-wide">Block Rate</p>
          </div>
        </div>
      )}

      {enabled && stats && stats.blocked > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          Last 30 days · {stats.total} total calls screened
        </p>
      )}

      {/* Custom IVR message */}
      {enabled && (
        <div className="border-t border-gray-800 pt-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400 font-medium">IVR Message</p>
            {!editingMessage ? (
              <button
                onClick={() => setEditingMessage(true)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingMessage(false)}
                  className="text-xs text-gray-500 hover:text-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMessage}
                  className="text-xs text-green-400 hover:text-green-300"
                >
                  Save
                </button>
              </div>
            )}
          </div>
          {editingMessage ? (
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <p className="text-sm text-gray-400 italic">&quot;{message}&quot;</p>
          )}
        </div>
      )}

      {/* Recent blocked calls log */}
      {enabled && recentCalls.length > 0 && (
        <div className="border-t border-gray-800 pt-3 mt-3">
          <button
            onClick={() => setShowLog(!showLog)}
            className="text-xs text-gray-400 hover:text-white transition flex items-center gap-1"
          >
            {showLog ? '▼' : '▶'} Recent screening log ({recentCalls.length})
          </button>
          {showLog && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {recentCalls.slice(0, 20).map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-gray-800/50"
                >
                  <span className="text-gray-400 font-mono">{call.callerPhone}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">
                      {new Date(call.createdAt).toLocaleDateString()}{' '}
                      {new Date(call.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {call.result === 'blocked' ? (
                      <span className="text-red-400 flex items-center gap-1">
                        <ShieldX className="h-3 w-3" /> Blocked
                      </span>
                    ) : (
                      <span className="text-green-400 flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Passed
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Disabled state */}
      {!enabled && (
        <p className="text-xs text-gray-600 mt-2">
          When enabled, callers must press 1 to get through. Blocks robocalls and spam autodialers.
        </p>
      )}
    </div>
  )
}
