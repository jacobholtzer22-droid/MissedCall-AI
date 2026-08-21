'use client'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { fbTrack } from '@/lib/meta-pixel'

const PIXEL_ID = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID

// NEXT_PUBLIC_* is inlined at build time. If this is empty in the deployed
// build, no amount of dashboard config fixes it without a redeploy — so say so
// loudly instead of rendering null and looking healthy.
const MISSING_ID_MESSAGE =
  '[MetaPixel] NEXT_PUBLIC_FACEBOOK_PIXEL_ID is missing from this build. ' +
  'No pixel is loaded, so PageView, Lead and Schedule events are NOT being sent to Meta. ' +
  'Set it in Vercel > Project > Settings > Environment Variables (Production) and REDEPLOY — ' +
  'NEXT_PUBLIC_* values are inlined at build time, so setting the variable alone does nothing.'

// Loader snippet. Differs from the stock Meta snippet in two deliberate ways:
//  1. It reuses an existing window.fbq stub (installed by lib/meta-pixel.ts)
//     instead of `if(f.fbq)return`, so a queue built before this runs survives.
//  2. fbevents.js is requested at most once, guarded by __aaFbEventsRequested.
const LOADER = (pixelId: string) => `
!function(f,b,e,v,n,t,s){
  if(!f.fbq){n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}
  if(!f._fbq)f._fbq=f.fbq;
  if(f.__aaFbEventsRequested)return;f.__aaFbEventsRequested=!0;
  t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
`

export default function MetaPixel() {
  const pathname = usePathname()
  const firstRender = useRef(true)
  const warned = useRef(false)

  useEffect(() => {
    if (!PIXEL_ID && !warned.current) {
      warned.current = true
      console.error(MISSING_ID_MESSAGE)
    }
  }, [])

  useEffect(() => {
    if (!PIXEL_ID) return
    // The loader snippet already fired the initial PageView.
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    fbTrack('PageView')
  }, [pathname])

  if (!PIXEL_ID) return null

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {LOADER(PIXEL_ID)}
    </Script>
  )
}
