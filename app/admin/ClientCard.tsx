'use client'

import { Eye, MessageSquare, Phone, ShieldCheck, Globe } from 'lucide-react'
import { getBusinessFeatures } from '@/lib/business-features'
import type { AdminBusiness, AdminStats } from './types'
import { HealthDot, StatusPill, FeatureIcons, Age, Stat } from './ui'

const KIND_ICON: Record<NonNullable<AdminStats['lastActivityKind']>, React.ComponentType<{ className?: string }>> = {
  call: Phone,
  screened: ShieldCheck,
  message: MessageSquare,
  web_lead: Globe,
}

const KIND_LABEL: Record<NonNullable<AdminStats['lastActivityKind']>, string> = {
  call: 'Last activity was a call',
  screened: 'Last activity was a screened call',
  message: 'Last activity was a text',
  web_lead: 'Last activity was a website lead',
}

interface Props {
  biz: AdminBusiness
  selected?: boolean
  showRevenue: boolean
  onSelect: (b: AdminBusiness) => void
}

export function ClientCard({ biz, selected, showRevenue, onSelect }: Props) {
  const s = biz.stats
  const hasPhone = Boolean(biz.telnyxPhoneNumber)
  const isWebOnly = !hasPhone
  const features = getBusinessFeatures(biz)

  const showFunnel = hasPhone && features.hasMissedCallAi
  const showScreening = features.hasAnyScreening
  const showWeb = isWebOnly || s.webLeadsMonth > 0
  const bookedTotal = s.bookedMonth.website + s.bookedMonth.sms
  const showBooked = features.hasCalendar || bookedTotal > 0
  const showAds = biz.googleAdsEnabled
  const showNeedsYou = s.humanNeeded > 0 || s.stalled > 0

  const needsYou = [
    s.humanNeeded > 0 ? `${s.humanNeeded} need${s.humanNeeded === 1 ? 's' : ''} a human` : null,
    s.stalled > 0 ? `${s.stalled} went quiet` : null,
  ]
    .filter(Boolean)
    .join(', ')

  const KindIcon = s.lastActivityKind ? KIND_ICON[s.lastActivityKind] : null

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(biz)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${biz.name}, open details`}
      onClick={() => onSelect(biz)}
      onKeyDown={onKeyDown}
      className={`rounded-lg border bg-gray-900 p-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        selected ? 'border-blue-500' : 'border-gray-800'
      }`}
    >
      {/* 1. Header */}
      <div className="flex items-start gap-2">
        <HealthDot health={biz.health} className="mt-[7px]" />
        <p className="flex-1 min-w-0 text-sm font-medium text-gray-100 leading-6">
          {biz.name}
          <StatusPill status={biz.subscriptionStatus} className="ml-2 align-middle" />
        </p>
        <span
          className="shrink-0 inline-flex items-center gap-1 text-xs text-gray-500 leading-6"
          title={s.lastActivityKind ? KIND_LABEL[s.lastActivityKind] : 'No activity recorded'}
        >
          {KindIcon && <KindIcon className="h-3.5 w-3.5" />}
          <Age iso={s.lastActivityAt} />
        </span>
      </div>

      {/* 2. Identity */}
      <div className="mt-1 flex items-center justify-between gap-2 pl-[18px]">
        {hasPhone ? (
          <span className="text-xs font-mono text-gray-500">{biz.telnyxPhoneNumber}</span>
        ) : (
          <span className="text-xs text-gray-500">Web only</span>
        )}
        <FeatureIcons biz={biz} />
      </div>

      <div className="mt-3 space-y-3 pl-[18px]">
        {/* 3. Funnel */}
        {showFunnel && (
          <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
            <Stat value={s.missedCallsMonth} label="Missed" />
            <Stat value={s.textbacksMonth} label="Texted" />
            <Stat value={s.repliedMonth} label="Replied" />
            <Stat value={s.capturedMonth} label="Captured" />
            {s.failedSms7d > 0 && (
              <span className="text-xs text-red-400 pb-0.5" title="Texts that failed to deliver in the last 7 days">
                {s.failedSms7d} failed
              </span>
            )}
          </div>
        )}

        {/* 4. Screening */}
        {showScreening && (
          <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
            <Stat value={s.spamBlockedMonth} label="Blocked" />
            <Stat value={s.spamPassedMonth} label="Passed" />
          </div>
        )}

        {/* 5. Web leads */}
        {showWeb && (
          <p className="text-sm text-gray-300">
            <span className="font-semibold tabular-nums text-gray-100">{s.webLeadsMonth}</span> web lead
            {s.webLeadsMonth === 1 ? '' : 's'}
            <span className="text-gray-500">
              , last <Age iso={s.lastWebLeadAt} />
            </span>
          </p>
        )}

        {/* 6. Booked */}
        {showBooked && (
          <div className="flex items-end">
            <Stat value={bookedTotal} label="Booked" />
          </div>
        )}

        {/* 7. Ads */}
        {showAds &&
          (s.ads30d ? (
            <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
              {showRevenue ? (
                <Stat value={`$${s.ads30d.spend.toFixed(0)}`} label="Ad spend, 30d" />
              ) : (
                <Stat value={s.ads30d.clicks} label="Clicks, 30d" />
              )}
              <Stat value={Math.round(s.ads30d.conversions)} label="Conversions" />
            </div>
          ) : (
            <p className="text-xs text-gray-500">No ad data in 30 days</p>
          ))}

        {/* 8. Needs you */}
        {showNeedsYou && <p className="text-sm text-amber-400">{needsYou}</p>}
      </div>

      {/* 9 + 10. Actions and fee */}
      <div className="mt-3 pt-2 border-t border-gray-800/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <a
            href={`/api/admin/view-as?businessId=${biz.id}`}
            title="View as client"
            aria-label="View as client"
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Eye className="h-4 w-4" />
          </a>
          <a
            href={`/admin/${biz.id}/conversations`}
            title="Conversations"
            aria-label="Conversations"
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <MessageSquare className="h-4 w-4" />
          </a>
        </div>
        {showRevenue && biz.monthlyFee != null && biz.subscriptionStatus !== 'canceled' && (
          <span className="text-xs text-gray-500 tabular-nums">${biz.monthlyFee}/mo</span>
        )}
      </div>
    </div>
  )
}
