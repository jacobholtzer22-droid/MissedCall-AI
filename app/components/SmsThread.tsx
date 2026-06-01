'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageSquareText, PhoneMissed, Check } from 'lucide-react'

type Bubble =
  | { kind: 'system'; text: string }
  | { kind: 'out'; text: string }
  | { kind: 'in'; text: string }
  | { kind: 'status'; chips: string[] }

const THREAD: Bubble[] = [
  { kind: 'system', text: 'Missed call · (480) 555-0192 · 2:14 PM' },
  { kind: 'out',    text: "Hey, this is Rivera Plumbing — sorry we missed your call! What do you need a hand with?" },
  { kind: 'in',     text: "Water heater's leaking all over my garage. Need someone out today." },
  { kind: 'out',    text: 'On it. Can I grab your name and the service address?' },
  { kind: 'in',     text: 'Marcus Bell — 4421 Cedar Ridge Dr.' },
  { kind: 'out',    text: 'Thanks Marcus. We can be there today at 3:30 PM or tomorrow at 9:00 AM — which works?' },
  { kind: 'in',     text: 'Today at 3:30.' },
  { kind: 'out',    text: "You're booked for today at 3:30 PM. We'll text when the tech is 20 min out." },
  { kind: 'status', chips: ['Lead captured', 'Owner notified', 'Job booked'] },
]

function Typing({ side }: { side: 'in' | 'out' }) {
  return (
    <div className={`flex ${side === 'out' ? 'justify-end' : 'justify-start'}`}>
      <div
        className="flex items-center gap-1 px-3.5 py-3"
        style={{ background: side === 'out' ? 'rgba(238,107,26,0.85)' : 'rgba(242,240,235,0.9)', borderRadius: 12 }}
      >
        <span className="aa-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#16181C' }} />
        <span className="aa-dot aa-dot2 inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#16181C' }} />
        <span className="aa-dot aa-dot3 inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#16181C' }} />
      </div>
    </div>
  )
}

function BubbleEl({ bubble }: { bubble: Bubble }) {
  if (bubble.kind === 'system') {
    return (
      <div className="aa-rise my-1 text-center">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em]" style={{ color: '#6E7681' }}>
          {bubble.text}
        </span>
      </div>
    )
  }
  if (bubble.kind === 'status') {
    return (
      <div className="aa-rise mt-2 flex flex-wrap items-center justify-center gap-1.5 border-t-2 pt-3" style={{ borderColor: 'rgba(110,118,129,0.3)' }}>
        {bubble.chips.map((c, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wider"
            style={{ background: 'rgba(238,107,26,0.14)', color: '#EE6B1A' }}
          >
            <Check size={11} strokeWidth={3} />{c}
          </span>
        ))}
      </div>
    )
  }
  const out = bubble.kind === 'out'
  return (
    <div className={`aa-rise flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] px-3.5 py-2.5 text-[13px] leading-snug"
        style={
          out
            ? { background: '#EE6B1A', color: '#16181C', borderRadius: '14px 14px 4px 14px', fontWeight: 500 }
            : { background: 'rgba(242,240,235,0.96)', color: '#16181C', borderRadius: '14px 14px 14px 4px' }
        }
      >
        {bubble.text}
      </div>
    </div>
  )
}

export default function SmsThread() {
  const [count, setCount] = useState(0)
  const startedRef = useRef(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !startedRef.current) {
            startedRef.current = true
            if (reduce) { setCount(THREAD.length); return }
            let i = 0
            const tick = () => {
              i += 1
              setCount(i)
              if (i < THREAD.length) {
                const next = THREAD[i]
                const delay = next?.kind === 'in' ? 900 : next?.kind === 'status' ? 700 : 1150
                window.setTimeout(tick, delay)
              }
            }
            window.setTimeout(tick, 400)
          }
        })
      },
      { threshold: 0.25 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className="aa-float relative mx-auto w-full max-w-[380px]">
      {/* Device shell */}
      <div
        className="relative overflow-hidden border-2"
        style={{ borderColor: '#16181C', background: '#16181C', boxShadow: '0 0 0 1px rgba(110,118,129,0.4)' }}
      >
        {/* Header bar */}
        <div
          className="flex items-center justify-between border-b-2 px-4 py-3"
          style={{ borderColor: 'rgba(110,118,129,0.35)', background: '#1A4A70' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center" style={{ background: '#EE6B1A' }}>
              <MessageSquareText size={15} strokeWidth={2.5} style={{ color: '#16181C' }} />
            </span>
            <div className="leading-tight">
              <div className="text-[12px] font-bold tracking-wide" style={{ color: '#FFFFFF' }}>Rivera Plumbing</div>
              <div className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: 'rgba(242,240,235,0.7)' }}>
                Auto text-back · live
              </div>
            </div>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: '#FFFFFF' }}>
            <span className="aa-live-dot inline-block h-2 w-2 rounded-full" style={{ background: '#EE6B1A' }} />
            on
          </span>
        </div>

        {/* Thread body */}
        <div className="flex min-h-[440px] flex-col gap-2.5 px-4 py-4" style={{ background: '#16181C' }}>
          {THREAD.slice(0, count).map((b, i) => (
            <BubbleEl key={i} bubble={b} />
          ))}
          {count < THREAD.length && count > 0 && THREAD[count]?.kind === 'in'  && <Typing side="in" />}
          {count < THREAD.length && count > 0 && THREAD[count]?.kind === 'out' && <Typing side="out" />}
        </div>
      </div>

      {/* "Lead saved" badge */}
      <div
        className="absolute -right-3 -top-3 z-10 hidden items-center gap-2 border-2 px-3 py-2 sm:flex"
        style={{ borderColor: '#16181C', background: '#EE6B1A' }}
      >
        <PhoneMissed size={14} strokeWidth={2.5} style={{ color: '#16181C' }} />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest" style={{ color: '#16181C' }}>
          Lead saved
        </span>
      </div>
    </div>
  )
}
