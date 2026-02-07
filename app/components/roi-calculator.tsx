'use client';

import { useState } from 'react';

export default function ROICalculator() {
  const [missedCallsPerMonth, setMissedCallsPerMonth] = useState(20);
  const [appointmentValue, setAppointmentValue] = useState(200);

  // Calculate metrics
  const missedCallsPerYear = missedCallsPerMonth * 12;
  
  // Conservative conversion rate: 30% of missed calls would book
  const conversionRate = 0.30;
  const appointmentsPerMonth = missedCallsPerMonth * conversionRate;
  const appointmentsPerYear = missedCallsPerYear * conversionRate;
  
  const monthlyRevenueLoss = appointmentsPerMonth * appointmentValue;
  const yearlyRevenueLoss = appointmentsPerYear * appointmentValue;
  
  const monthlyServiceCost = 299;
  const monthlyNetGain = monthlyRevenueLoss - monthlyServiceCost;
  const yearlyNetGain = (monthlyRevenueLoss * 12) - (monthlyServiceCost * 12);
  
  const roi = ((monthlyNetGain / monthlyServiceCost) * 100).toFixed(0);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 md:p-6 shadow-xl">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            Calculate Your Revenue Loss
          </h2>
          <p className="text-base text-gray-600">
            See exactly how much revenue you're leaving on the table
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-lg mb-6">
          <div className="space-y-6">
            {/* Missed Calls Input */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Missed Calls Per Month
                </label>
                <span className="text-xl font-bold text-indigo-600">
                  {missedCallsPerMonth}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="150"
                value={missedCallsPerMonth}
                onChange={(e) => setMissedCallsPerMonth(Number(e.target.value))}
                className="w-full h-3 bg-indigo-100 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>1</span>
                <span>75</span>
                <span>150</span>
              </div>
            </div>

            {/* Appointment Value Input */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Average Appointment Value
                </label>
                <span className="text-xl font-bold text-indigo-600">
                  ${appointmentValue}
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="1000"
                step="1"
                value={appointmentValue}
                onChange={(e) => setAppointmentValue(Number(e.target.value))}
                className="w-full h-3 bg-indigo-100 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>$50</span>
                <span>$500</span>
                <span>$1,000</span>
              </div>
            </div>
          </div>
        </div>

        {/* Results Grid */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Revenue Loss */}
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">
              You're Currently Losing
            </div>
            <div className="text-3xl font-bold text-red-700 mb-0.5">
              ${monthlyRevenueLoss.toLocaleString()}
            </div>
            <div className="text-sm text-red-600">
              per month (est. {appointmentsPerMonth.toFixed(0)} bookings lost from those missed calls at 30% conversion)
            </div>
            <div className="mt-3 pt-3 border-t border-red-200">
              <div className="text-xs text-red-600 mb-0.5">Annual Revenue Loss</div>
              <div className="text-xl font-bold text-red-700">
                ${yearlyRevenueLoss.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Net Gain with MissedCall AI */}
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">
              Your Monthly Net Gain
            </div>
            <div className="text-3xl font-bold text-green-700 mb-0.5">
              ${monthlyNetGain.toLocaleString()}
            </div>
            <div className="text-sm text-green-600">
              after $299/mo service cost
            </div>
            <div className="text-sm text-green-600">
              Based on 30% of missed calls converting to bookings
            </div>
            <div className="mt-3 pt-3 border-t border-green-200">
              <div className="text-xs text-green-600 mb-0.5">Annual Net Gain</div>
              <div className="text-xl font-bold text-green-700">
                ${yearlyNetGain.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* ROI Highlight */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl p-5 text-center text-white">
          <div className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-90">
            Return on Investment
          </div>
          <div className="text-5xl font-bold mb-1">
            {roi}%
          </div>
          <div className="text-base opacity-90 mb-4">
            Every $1 spent returns ${(Number(roi) / 100 + 1).toFixed(2)}
          </div>
          <a
            href="#book-demo"
            className="inline-block bg-white text-indigo-600 font-bold px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors shadow-lg text-sm"
          >
            Book Your Free Demo →
          </a>
        </div>

        {/* Fine Print */}
        <div className="text-center mt-4 text-xs text-gray-500">
          *Calculations assume 30% conversion rate on missed calls. Your actual results may vary.
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: #4f46e5;
          cursor: pointer;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #4f46e5;
          cursor: pointer;
          border-radius: 50%;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}