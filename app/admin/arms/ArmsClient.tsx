'use client'

export type ArmRow = {
  arm: string
  views: number
  verifiedLeads: number
  watchViews: number
  bookings: number
  verifiedRate: number | null
  watch: { started: number; half: number; threeQuarters: number; complete: number }
  watchThrough: { half: number | null; threeQuarters: number | null; complete: number | null }
}

export type BookingSources = { funnel: number; smsLink: number; direct: number }

export type ArmVideo = {
  arm: string
  path: string
  configured: string
  served: { url: string; count: number }[]
}

export type AdRow = { arm: string; ad: string; leads: number; bookings: number }

export type StepRow = {
  arm: string
  label: string
  count: number
  source: string
  /** Share of the step above. Null on the first step and on branch rows. */
  pctOfPrev: number | null
}

export type ArmsData = {
  videos: ArmVideo[]
  missingVideo: string[]
  bookingSources: { last7: BookingSources; lifetime: BookingSources }
  ads: { last7: AdRow[]; lifetime: AdRow[] }
  steps: { last7: StepRow[][]; lifetime: StepRow[][] }
  last7: ArmRow[]
  lifetime: ArmRow[]
  recentVerified: {
    createdAt: string
    arm: string
    trade: string | null
    businessName: string | null
    phone: string | null
  }[]
}

/**
 * The funnel as steps, one column per arm.
 *
 * The percentage is of the step directly above, not of landing views: a single
 * "3% of visitors book" number tells you nothing about WHERE they went, and
 * every step here was added because the answer was previously a guess.
 */
function StepFunnel({ title, arms }: { title: string; arms: StepRow[][] }) {
  const withData = arms.filter((rows) => rows.some((r) => r.count > 0))
  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-1">{title}</h2>
      {/* Modal opens and the four screen rows only started being recorded on
          2026-09-06. Anything before that has a real OTP count sitting under an
          under-counted screen count, which is why a percentage can read above
          100 on historic windows. It settles as the new rows accumulate. */}
      <p className="mb-3 text-xs text-gray-600">
        Step logging began 2026-09-06. Over 100% means the step above it was not yet being recorded.
      </p>
      {withData.length === 0 ? (
        <p className="text-sm text-gray-500">No traffic recorded yet.</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {withData.map((rows) => (
            <div key={rows[0].arm} className="overflow-x-auto">
              <h3 className="mb-2 font-mono text-xs uppercase tracking-wider text-gray-500">
                Arm {rows[0].arm}
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-800">
                    <th className="py-2 pr-4 font-medium">Step</th>
                    <th className="py-2 pr-4 font-medium text-right">Count</th>
                    <th className="py-2 pr-4 font-medium text-right">% of prev</th>
                    <th className="py-2 font-medium text-gray-600">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-gray-900">
                      <td className="py-2 pr-4">{r.label}</td>
                      <td className="py-2 pr-4 text-right font-mono">{r.count}</td>
                      <td
                        className="py-2 pr-4 text-right font-mono"
                        style={
                          r.pctOfPrev !== null && r.pctOfPrev < 25
                            ? { color: '#EE6B1A' }
                            : { color: '#9CA3AF' }
                        }
                      >
                        {r.pctOfPrev === null ? '—' : `${r.pctOfPrev}%`}
                      </td>
                      <td className="py-2 text-xs text-gray-600">{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Which ad produced the leads, per arm.
 *
 * The ad name is utm_term. Historically most links did not carry one, and the
 * wizard's 300-character cap sliced it off many that did, so a large
 * "(no ad in link)" row on older data is expected rather than a bug.
 */
function AdTable({ title, rows }: { title: string; rows: AdRow[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No leads in this window.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="py-2 pr-4 font-medium">Arm</th>
                <th className="py-2 pr-4 font-medium">Ad (utm_term)</th>
                <th className="py-2 pr-4 font-medium text-right">Leads</th>
                <th className="py-2 pr-4 font-medium text-right">Bookings</th>
                <th className="py-2 pr-4 font-medium text-right">Book rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.arm}-${r.ad}`} className="border-b border-gray-900">
                  <td className="py-2 pr-4 font-mono">{r.arm}</td>
                  <td className="py-2 pr-4 break-all">{r.ad}</td>
                  <td className="py-2 pr-4 text-right">{r.leads}</td>
                  <td className="py-2 pr-4 text-right">{r.bookings}</td>
                  <td className="py-2 pr-4 text-right text-gray-400">
                    {r.leads > 0 ? `${Math.round((r.bookings / r.leads) * 1000) / 10}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Table({ title, rows }: { title: string; rows: ArmRow[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No traffic recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="py-2 pr-4 font-medium">Arm</th>
                <th className="py-2 pr-4 font-medium text-right">Views</th>
                <th className="py-2 pr-4 font-medium text-right">Verified leads</th>
                <th className="py-2 pr-4 font-medium text-right">Watch views</th>
                <th className="py-2 pr-4 font-medium text-right">Verified rate</th>
                <th className="py-2 pr-4 font-medium text-right">Bookings</th>
                <th className="py-2 pr-4 font-medium text-right">Started video</th>
                <th className="py-2 pr-4 font-medium text-right">50%</th>
                <th className="py-2 pr-4 font-medium text-right">75%</th>
                <th className="py-2 font-medium text-right">Finished</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.arm} className="border-b border-gray-900">
                  <td className="py-2 pr-4 font-bold text-gray-100">{r.arm}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-300">{r.views.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-300">{r.verifiedLeads.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-300">{r.watchViews.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums font-semibold text-orange-400">
                    {/* An em dash, not 0%: no views means the rate is unknown,
                        which is a different fact from "nobody converted". */}
                    {r.verifiedRate === null ? '—' : `${r.verifiedRate}%`}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-300">{r.bookings.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-300">{r.watch.started.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-400">
                    {r.watchThrough.half === null ? '—' : `${r.watchThrough.half}%`}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-gray-400">
                    {r.watchThrough.threeQuarters === null ? '—' : `${r.watchThrough.threeQuarters}%`}
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold text-orange-400">
                    {r.watchThrough.complete === null ? '—' : `${r.watchThrough.complete}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function ArmsClient({ data }: { data: ArmsData }) {
  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <h1 className="text-2xl font-black uppercase tracking-tight mb-1">Funnel arms</h1>
      <p className="text-sm text-gray-500 mb-8">
        Views, OTP-verified leads, bookings and video watch-through, per arm. Watch-through is a
        share of people who STARTED the video, not of page views. A verified lead row is written in
        the same request that fires the Meta Lead event, so this column and Events Manager are
        counting the same thing.
      </p>

      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">Video per arm</h2>
        {data.missingVideo.length > 0 && (
          <p className="mb-3 rounded border border-red-800 bg-red-950 px-3 py-2 text-sm font-semibold text-red-300">
            Arm {data.missingVideo.join(' and ')} has NO VIDEO configured. Set
            NEXT_PUBLIC_FUNNEL_VIDEO_B. It is deliberately not falling back to arm A — that would
            collapse the test into one arm without anything looking broken.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-500">
                <th className="py-2 pr-4 font-medium">Arm</th>
                <th className="py-2 pr-4 font-medium">Path</th>
                <th className="py-2 pr-4 font-medium">Configured now</th>
                <th className="py-2 font-medium">Actually served (watch views)</th>
              </tr>
            </thead>
            <tbody>
              {data.videos.map((v) => (
                <tr key={v.arm} className="border-b border-gray-900 align-top">
                  <td className="py-2 pr-4 font-bold text-gray-100">{v.arm}</td>
                  <td className="py-2 pr-4 font-mono text-gray-400">{v.path}</td>
                  <td className="py-2 pr-4 break-all text-gray-300">
                    {v.configured || <span className="font-semibold text-red-400">NOT SET</span>}
                  </td>
                  <td className="py-2 break-all text-gray-400">
                    {v.served.length === 0
                      ? '—'
                      : v.served.map((s) => (
                          <div key={s.url}>
                            {s.url.split('/').pop()} <span className="text-gray-600">×{s.count}</span>
                          </div>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
          Bookings by source
        </h2>
        <p className="text-xs text-gray-600 mb-3">
          Ad-driven and cold bookings counted apart. Funnel is /book, SMS link is a texted
          /calendar link, Direct is someone who opened /calendar with no token.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="py-2 pr-4 font-medium">Window</th>
                <th className="py-2 pr-4 font-medium text-right">Funnel</th>
                <th className="py-2 pr-4 font-medium text-right">SMS link</th>
                <th className="py-2 font-medium text-right">Direct</th>
              </tr>
            </thead>
            <tbody>
              {([['Last 7 days', data.bookingSources.last7], ['Lifetime', data.bookingSources.lifetime]] as const).map(
                ([label, s]) => (
                  <tr key={label} className="border-b border-gray-900">
                    <td className="py-2 pr-4 font-bold text-gray-100">{label}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-300">{s.funnel}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-orange-400 font-semibold">{s.smsLink}</td>
                    <td className="py-2 text-right tabular-nums text-gray-300">{s.direct}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <StepFunnel title="Funnel steps — last 7 days" arms={data.steps.last7} />
      <StepFunnel title="Funnel steps — lifetime" arms={data.steps.lifetime} />

      <Table title="Last 7 days" rows={data.last7} />
      <Table title="Lifetime" rows={data.lifetime} />

      <AdTable title="By ad — last 7 days" rows={data.ads.last7} />
      <AdTable title="By ad — lifetime" rows={data.ads.lifetime} />

      <section>
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
          Recent verified leads
        </h2>
        {data.recentVerified.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing verified yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="py-2 pr-4 font-medium">When</th>
                  <th className="py-2 pr-4 font-medium">Arm</th>
                  <th className="py-2 pr-4 font-medium">Trade</th>
                  <th className="py-2 pr-4 font-medium">Business</th>
                  <th className="py-2 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody>
                {data.recentVerified.map((r, i) => (
                  <tr key={`${r.createdAt}-${i}`} className="border-b border-gray-900">
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-bold text-gray-100">{r.arm}</td>
                    <td className="py-2 pr-4 text-gray-300">{r.trade || '—'}</td>
                    <td className="py-2 pr-4 text-gray-300">{r.businessName || '—'}</td>
                    <td className="py-2 text-gray-300 tabular-nums">{r.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
