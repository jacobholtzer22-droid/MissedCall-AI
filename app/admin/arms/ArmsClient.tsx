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

export type ArmsData = {
  bookingSources: { last7: BookingSources; lifetime: BookingSources }
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

      <Table title="Last 7 days" rows={data.last7} />
      <Table title="Lifetime" rows={data.lifetime} />

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
