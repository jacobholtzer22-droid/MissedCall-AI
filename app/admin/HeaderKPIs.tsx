import type { AdminBusiness } from './types'

interface Props {
  businesses: AdminBusiness[]
}

export function HeaderKPIs({ businesses }: Props) {
  const mrr = businesses
    .filter(b => b.subscriptionStatus === 'active' || b.subscriptionStatus === 'past_due')
    .reduce((sum, b) => sum + (b.monthlyFee ?? 0), 0)

  const active = businesses.filter(b => b.subscriptionStatus === 'active').length
  const trialing = businesses.filter(b => b.subscriptionStatus === 'trialing').length
  const pastDue = businesses.filter(b => b.subscriptionStatus === 'past_due').length
  const canceled = businesses.filter(b => b.subscriptionStatus === 'canceled').length

  const convosThisMonth = businesses.reduce((sum, b) => sum + b.conversationsThisMonth, 0)
  const convosLastMonth = businesses.reduce((sum, b) => sum + b.conversationsLastMonth, 0)
  const delta =
    convosLastMonth > 0
      ? Math.round(((convosThisMonth - convosLastMonth) / convosLastMonth) * 100)
      : null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {/* MRR */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
          MRR (Active + Past Due)
        </p>
        <p className="text-2xl font-bold text-white">
          ${mrr.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </p>
        <p className="text-xs text-gray-500 mt-1">/mo</p>
      </div>

      {/* Status breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Clients</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <span>
            <span className="text-green-400 font-semibold">{active}</span>
            <span className="text-gray-500 ml-1">Active</span>
          </span>
          <span className="text-gray-700">·</span>
          <span>
            <span className="text-yellow-400 font-semibold">{trialing}</span>
            <span className="text-gray-500 ml-1">Trialing</span>
          </span>
          <span className="text-gray-700">·</span>
          <span>
            <span className="text-orange-400 font-semibold">{pastDue}</span>
            <span className="text-gray-500 ml-1">Past Due</span>
          </span>
          <span className="text-gray-700">·</span>
          <span>
            <span className="text-gray-400 font-semibold">{canceled}</span>
            <span className="text-gray-500 ml-1">Canceled</span>
          </span>
        </div>
        <p className="text-xs text-gray-600 mt-1">{businesses.length} total</p>
      </div>

      {/* Conversations this month */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
          Conversations This Month
        </p>
        <p className="text-2xl font-bold text-white">
          {convosThisMonth.toLocaleString()}
          {delta !== null && (
            <span
              className={`ml-2 text-sm font-medium ${
                delta >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {delta >= 0 ? '+' : ''}
              {delta}%
            </span>
          )}
        </p>
        <p className="text-xs text-gray-500 mt-1">{convosLastMonth} last month</p>
      </div>
    </div>
  )
}
