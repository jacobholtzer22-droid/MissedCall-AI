'use client'

import { useState } from 'react'

export default function ROICalculator({ hideHeading = false }: { hideHeading?: boolean }) {
  const [missedCallsPerMonth, setMissedCallsPerMonth] = useState(20)
  const [appointmentValue, setAppointmentValue] = useState(200)

  const conversionRate = 0.30
  const appointmentsPerMonth = missedCallsPerMonth * conversionRate
  const appointmentsPerYear = missedCallsPerMonth * 12 * conversionRate
  const monthlyRevenueLoss = appointmentsPerMonth * appointmentValue
  const yearlyRevenueLoss = appointmentsPerYear * appointmentValue
  const monthlyServiceCost = 299
  const monthlyNetGain = monthlyRevenueLoss - monthlyServiceCost
  const yearlyNetGain = (monthlyRevenueLoss * 12) - (monthlyServiceCost * 12)
  const roi = ((monthlyNetGain / monthlyServiceCost) * 100).toFixed(0)

  return (
    <div className="border-2 p-6 md:p-8" style={{ background: '#16181C', borderColor: 'rgba(110,118,129,0.35)', color: '#F2F0EB' }}>
      {!hideHeading && (
        <div className="text-center mb-6">
          <h3 className="text-[26px] md:text-[32px] font-black uppercase tracking-tight mb-2">
            Rough Cost of Missed Calls
          </h3>
          <p className="text-[14px]" style={{ color: '#6E7681' }}>
            A ballpark estimate based on your numbers. Every business is different.
          </p>
        </div>
      )}

      {/* Sliders */}
      <div className="border-2 p-5 mb-6 space-y-7" style={{ borderColor: 'rgba(110,118,129,0.25)', background: 'rgba(242,240,235,0.03)' }}>
        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#6E7681' }}>
              Missed Calls Per Month
            </label>
            <span className="text-[22px] font-black tabular-nums" style={{ color: '#EE6B1A' }}>{missedCallsPerMonth}</span>
          </div>
          <input
            type="range"
            min="1"
            max="150"
            value={missedCallsPerMonth}
            onChange={e => setMissedCallsPerMonth(Number(e.target.value))}
            className="aa-slider w-full h-2 appearance-none cursor-pointer"
            style={{ accentColor: '#EE6B1A', background: 'rgba(110,118,129,0.3)' }}
          />
          <div className="flex justify-between font-mono text-[10px] mt-2" style={{ color: '#6E7681' }}>
            <span>1</span><span>75</span><span>150</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: '#6E7681' }}>
              Average Job Value
            </label>
            <span className="text-[22px] font-black tabular-nums" style={{ color: '#EE6B1A' }}>${appointmentValue}</span>
          </div>
          <input
            type="range"
            min="50"
            max="1000"
            step="1"
            value={appointmentValue}
            onChange={e => setAppointmentValue(Number(e.target.value))}
            className="aa-slider w-full h-2 appearance-none cursor-pointer"
            style={{ accentColor: '#EE6B1A', background: 'rgba(110,118,129,0.3)' }}
          />
          <div className="flex justify-between font-mono text-[10px] mt-2" style={{ color: '#6E7681' }}>
            <span>$50</span><span>$500</span><span>$1,000</span>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="border-2 p-5" style={{ borderColor: 'rgba(238,107,26,0.4)', background: 'rgba(238,107,26,0.07)' }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: '#EE6B1A' }}>
            You&apos;re currently losing
          </div>
          <div className="text-[32px] font-black tabular-nums mb-0.5" style={{ color: '#EE6B1A' }}>
            ${monthlyRevenueLoss.toLocaleString()}
          </div>
          <div className="text-[12px]" style={{ color: 'rgba(238,107,26,0.8)' }}>
            per month (est. {appointmentsPerMonth.toFixed(0)} jobs lost · 30% conv.)
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(238,107,26,0.25)' }}>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: '#EE6B1A' }}>Annual loss</div>
            <div className="text-[20px] font-black tabular-nums" style={{ color: '#EE6B1A' }}>${yearlyRevenueLoss.toLocaleString()}</div>
          </div>
        </div>

        <div className="border-2 p-5" style={{ borderColor: 'rgba(26,74,112,0.5)', background: 'rgba(26,74,112,0.1)' }}>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: '#1A4A70' }}>
            Monthly net gain
          </div>
          <div className="text-[32px] font-black tabular-nums mb-0.5" style={{ color: '#F2F0EB' }}>
            ${monthlyNetGain.toLocaleString()}
          </div>
          <div className="text-[12px]" style={{ color: '#6E7681' }}>
            after $299/mo service cost
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(110,118,129,0.25)' }}>
            <div className="font-mono text-[10px] uppercase tracking-widest mb-0.5" style={{ color: '#6E7681' }}>Annual net gain</div>
            <div className="text-[20px] font-black tabular-nums" style={{ color: '#F2F0EB' }}>${yearlyNetGain.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="p-5 text-center" style={{ background: '#1A4A70' }}>
        <div className="text-[14px] mb-4" style={{ color: 'rgba(242,240,235,0.7)' }}>
          These are rough numbers, not a guarantee. But if you want to see what it actually looks like for your business, book a call and we'll walk through it together.
        </div>
        <a
          href="/book"
          className="aa-btn inline-block px-7 py-3.5 text-[14px] font-bold uppercase tracking-wide"
          style={{ background: '#EE6B1A', color: '#16181C' }}
        >
          Book a free call →
        </a>
      </div>

      <p className="text-center mt-3 text-[11px]" style={{ color: '#6E7681' }}>
        Based on an estimated 30% conversion rate. Your actual results will depend on your trade, market, and average job value.
      </p>
    </div>
  )
}
