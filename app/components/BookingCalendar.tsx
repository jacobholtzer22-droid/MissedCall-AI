'use client'

import { useState, useEffect } from 'react'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  parseISO,
  getDay,
} from 'date-fns'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface BookingCalendarProps {
  today: string // YYYY-MM-DD in business timezone
  maxDate: string // YYYY-MM-DD
  selectedDate: string
  onSelectDate: (date: string) => void
}

/** Get date string YYYY-MM-DD from a Date (using local date parts to avoid UTC shift) */
function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function BookingCalendar({ today, maxDate, selectedDate, onSelectDate }: BookingCalendarProps) {
  const todayDate = parseISO(today)

  // View state: start at current month (from today); sync when today prop changes
  const [viewDate, setViewDate] = useState(() => startOfMonth(todayDate))
  useEffect(() => {
    const newToday = parseISO(today)
    setViewDate(prev => {
      const prevMonth = prev.getMonth()
      const prevYear = prev.getFullYear()
      const todayMonth = newToday.getMonth()
      const todayYear = newToday.getFullYear()
      if (prevYear < todayYear || (prevYear === todayYear && prevMonth < todayMonth)) {
        return startOfMonth(newToday)
      }
      return prev
    })
  }, [today])

  const isCurrentMonth = viewDate.getMonth() === todayDate.getMonth() && viewDate.getFullYear() === todayDate.getFullYear()
  const canGoPrev = !isCurrentMonth

  const nextMonth = () => {
    setViewDate(d => addMonths(d, 1))
  }

  const prevMonth = () => {
    if (canGoPrev) {
      setViewDate(d => subMonths(d, 1))
    }
  }

  const monthStart = startOfMonth(viewDate)
  const monthEnd = endOfMonth(viewDate)

  // Start the grid on Sunday; pad with empty cells if month doesn't start on Sunday
  const startPad = getDay(monthStart) // 0 = Sunday
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const handleDayClick = (dateStr: string) => {
    const d = parseISO(dateStr)
    if (dateStr < today) return
    if (dateStr > maxDate) return
    onSelectDate(dateStr)
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: '#e5e7eb', backgroundColor: '#ffffff' }}>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="p-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
          aria-label="Previous month"
          style={{ color: '#374151' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="font-semibold" style={{ color: '#111827' }}>
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-2 rounded-lg transition hover:bg-gray-100"
          aria-label="Next month"
          style={{ color: '#374151' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_NAMES.map(day => (
          <div key={day} className="text-xs font-medium py-1" style={{ color: '#6b7280' }}>
            {day}
          </div>
        ))}
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} className="h-10" />
        ))}
        {daysInMonth.map(day => {
          const dateStr = toDateString(day)
          const isPast = dateStr < today
          const isFuture = dateStr > maxDate
          const isSelected = dateStr === selectedDate
          const disabled = isPast || isFuture

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => handleDayClick(dateStr)}
              disabled={disabled}
              className={`h-10 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
                isSelected ? 'text-white' : 'hover:bg-gray-100'
              }`}
              style={
                isSelected
                  ? { backgroundColor: '#2563eb' }
                  : disabled
                    ? { color: '#9ca3af' }
                    : { color: '#374151' }
              }
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
