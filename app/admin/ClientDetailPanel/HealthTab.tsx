'use client'

// Read-only health view for one client. Everything comes from props
// (stats/health/alerts computed in lib/admin-stats.ts); no fetches.

import { getBusinessFeatures } from '@/lib/business-features'
import type { AdminBusiness } from '../types'
import { HealthDot, Age, Stat } from '../ui'

interface Props {
  business: AdminBusiness
  showRevenue: boolean
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-4 border-b border-gray-800/60 last:border-0">
      <h3 className="text-sm font-medium text-gray-100 mb-2">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-100 tabular-nums text-right">{children}</span>
    </div>
  )
}

export function HealthTab({ business: biz, showRevenue }: Props) {
  const s = biz.stats
  const hasPhone = Boolean(biz.telnyxPhoneNumber)
  const features = getBusinessFeatures(biz)
  const showFunnel = hasPhone && features.hasMissedCallAi
  const showScreening = features.hasAnyScreening

  return (
    <div className="px-4 sm:px-6">
      <Section title="Alerts">
        {biz.alerts.length === 0 ? (
          <p className="text-sm text-gray-400 flex items-center gap-2">
            <HealthDot health={biz.health} />
            {biz.health === 'gray' ? 'Canceled, not monitored' : 'No alerts'}
          </p>
        ) : (
          <ul className="space-y-1">
            {biz.alerts.map(a => (
              <li key={a.code} className="flex items-start gap-2 text-sm">
                <HealthDot health={a.severity === 'red' ? 'red' : 'yellow'} className="mt-1.5" />
                <span className={a.severity === 'red' ? 'text-red-400' : 'text-gray-300'}>{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Activity">
        <Row label="Last call"><Age iso={s.lastCallAt} /></Row>
        <Row label="Last screened call"><Age iso={s.lastScreenedAt} /></Row>
        <Row label="Last message"><Age iso={s.lastConversationAt} /></Row>
        <Row label="Last web lead"><Age iso={s.lastWebLeadAt} /></Row>
      </Section>

      <Section title="This month">
        <div className="space-y-3">
          {showFunnel && (
            <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
              <Stat value={s.missedCallsMonth} label="Missed" />
              <Stat value={s.textbacksMonth} label="Texted" />
              <Stat value={s.repliedMonth} label="Replied" />
              <Stat value={s.capturedMonth} label="Captured" />
            </div>
          )}
          {showScreening && (
            <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
              <Stat value={s.spamBlockedMonth} label="Blocked" />
              <Stat value={s.spamPassedMonth} label="Passed" />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
            <Stat value={s.webLeadsMonth} label="Web leads" />
            <Stat value={s.bookedMonth.website + s.bookedMonth.sms} label="Booked" />
            <Stat value={s.bookedMonth.website} label="via website" tone="muted" />
            <Stat value={s.bookedMonth.sms} label="via text" tone="muted" />
          </div>
          {(s.humanNeeded > 0 || s.stalled > 0) && (
            <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
              <Stat value={s.humanNeeded} label="Need a human" tone={s.humanNeeded > 0 ? 'amber' : 'muted'} />
              <Stat value={s.stalled} label="Went quiet" tone={s.stalled > 0 ? 'amber' : 'muted'} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Skipped texts">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-1">
          <Stat value={s.skipsMonth.cooldown} label="Cooldown" />
          <Stat value={s.skipsMonth.existing_contact} label="Existing contact" />
          <Stat value={s.skipsMonth.blocked} label="Blocked" />
        </div>
      </Section>

      <Section title="Delivery, last 7 days">
        <p className={`text-sm ${s.failedSms7d > 0 ? 'text-red-400' : 'text-gray-300'}`}>
          <span className="font-semibold tabular-nums">{s.failedSms7d}</span> failed of{' '}
          <span className="font-semibold tabular-nums">{s.finalizedSms7d}</span> finalized
        </p>
      </Section>

      <Section title="Telnyx">
        {hasPhone ? (
          <>
            {showRevenue ? (
              <Row label="Cost this month">${s.telnyxCostMonth.toFixed(2)}</Row>
            ) : (
              <Row label="Cost this month"><span className="text-gray-500">Hidden</span></Row>
            )}
            <Row label="Last usage record"><Age iso={s.telnyxLastRecordAt} /></Row>
          </>
        ) : (
          <p className="text-sm text-gray-400">No Telnyx number</p>
        )}
      </Section>

      <Section title="Ads, last 30 days">
        {!biz.googleAdsEnabled ? (
          <p className="text-sm text-gray-400">Google Ads not enabled</p>
        ) : !s.ads30d ? (
          <p className="text-sm text-gray-400">No ad data in 30 days</p>
        ) : (
          <>
            {showRevenue ? (
              <Row label="Spend">${s.ads30d.spend.toFixed(2)}</Row>
            ) : (
              <Row label="Spend"><span className="text-gray-500">Hidden</span></Row>
            )}
            <Row label="Clicks">{s.ads30d.clicks}</Row>
            <Row label="Conversions">{Math.round(s.ads30d.conversions)}</Row>
            <Row label="Last synced"><Age iso={s.ads30d.lastSyncAt} /></Row>
          </>
        )}
      </Section>
    </div>
  )
}
