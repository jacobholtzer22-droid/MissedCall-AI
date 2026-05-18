'use client'

import { Eye, MessageSquare, Settings, MessageCircle, Calendar, Megaphone, Globe, Shield } from 'lucide-react'
import type { AdminBusiness } from './types'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  trialing: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  past_due: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  canceled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past Due',
  canceled: 'Canceled',
}

interface FeatureIconProps {
  active: boolean
  title: string
  icon: React.ComponentType<{ className?: string }>
}

function FeatureIcon({ active, title, icon: Icon }: FeatureIconProps) {
  return (
    <span title={title} className={active ? 'text-blue-400' : 'text-gray-700'}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800/50">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-4">
          <div className="h-3 bg-gray-800 rounded animate-pulse" style={{ width: `${60 + (i * 13) % 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

function TableHead() {
  return (
    <tr className="bg-gray-900/80 text-left border-b border-gray-800">
      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">MRR</th>
      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Features</th>
      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Convos</th>
      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Leads</th>
      <th className="px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
    </tr>
  )
}

interface Props {
  businesses: AdminBusiness[]
  selectedId?: string
  onSelect: (b: AdminBusiness) => void
  loading?: boolean
}

export function ClientTable({ businesses, selectedId, onSelect, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead><TableHead /></thead>
          <tbody>{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</tbody>
        </table>
      </div>
    )
  }

  if (businesses.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-12 text-center text-gray-500">
        No clients match your filters.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full">
        <thead><TableHead /></thead>
        <tbody className="divide-y divide-gray-800/50">
          {businesses.map(biz => (
            <tr
              key={biz.id}
              onClick={() => onSelect(biz)}
              className={`cursor-pointer transition-colors group ${
                selectedId === biz.id
                  ? 'bg-blue-600/5 border-l-2 border-l-blue-500'
                  : 'hover:bg-gray-900/50'
              }`}
            >
              {/* Name + phone */}
              <td className="px-4 py-3 min-w-[180px]">
                <p className="font-semibold text-white text-sm leading-tight">{biz.name}</p>
                {biz.telnyxPhoneNumber && (
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{biz.telnyxPhoneNumber}</p>
                )}
                {!biz.telnyxPhoneNumber && (
                  <p className="text-xs text-red-400/70 mt-0.5">No number</p>
                )}
              </td>

              {/* Status */}
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${
                    STATUS_COLORS[biz.subscriptionStatus] ?? STATUS_COLORS.canceled
                  }`}
                >
                  {STATUS_LABELS[biz.subscriptionStatus] ?? biz.subscriptionStatus}
                </span>
              </td>

              {/* MRR */}
              <td className="px-4 py-3 whitespace-nowrap">
                {biz.subscriptionStatus !== 'canceled' && biz.monthlyFee != null ? (
                  <span className="text-sm text-gray-300">${biz.monthlyFee}/mo</span>
                ) : (
                  <span className="text-gray-700 text-sm">—</span>
                )}
              </td>

              {/* Feature icons */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <FeatureIcon
                    active={biz.callScreenerEnabled || biz.spamFilterEnabled}
                    title={
                      biz.callScreenerEnabled && biz.spamFilterEnabled
                        ? 'Call Screener + Spam Filter'
                        : biz.callScreenerEnabled
                        ? 'Call Screener'
                        : biz.spamFilterEnabled
                        ? 'Spam Filter'
                        : 'No screening'
                    }
                    icon={Shield}
                  />
                  <FeatureIcon
                    active={biz.missedCallAiEnabled}
                    title={biz.missedCallAiEnabled ? 'MissedCall AI on' : 'MissedCall AI off'}
                    icon={MessageCircle}
                  />
                  <FeatureIcon
                    active={biz.calendarEnabled && biz.googleCalendarConnected}
                    title={
                      biz.calendarEnabled && biz.googleCalendarConnected
                        ? 'Calendar connected'
                        : biz.calendarEnabled
                        ? 'Calendar enabled, not connected'
                        : 'Calendar off'
                    }
                    icon={Calendar}
                  />
                  <FeatureIcon
                    active={biz.googleAdsEnabled}
                    title={biz.googleAdsEnabled ? 'Google Ads on' : 'Google Ads off'}
                    icon={Megaphone}
                  />
                  <FeatureIcon
                    active={biz.calendarEnabled}
                    title={biz.calendarEnabled ? 'Online booking on' : 'Online booking off'}
                    icon={Globe}
                  />
                </div>
              </td>

              {/* Convos this month */}
              <td className="px-4 py-3">
                <a
                  href={`/admin/${biz.id}/conversations`}
                  onClick={e => e.stopPropagation()}
                  className="text-sm text-gray-300 hover:text-white transition underline-offset-2 hover:underline"
                  title={`${biz.conversationsThisMonth} this month · ${biz.conversationsLastMonth} last month`}
                >
                  {biz.conversationsThisMonth}
                </a>
              </td>

              {/* Leads this month */}
              <td className="px-4 py-3">
                <span className="text-sm text-gray-300">{biz.leadsThisMonth}</span>
              </td>

              {/* Actions */}
              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1.5">
                  <a
                    href={`/api/admin/view-as?businessId=${biz.id}`}
                    title="View as client"
                    className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </a>
                  <a
                    href={`/admin/${biz.id}/conversations`}
                    title="Conversations"
                    className="p-1.5 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => onSelect(biz)}
                    title="Edit / Detail"
                    className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
