import { ImageResponse } from 'next/og'

// Sitewide og:image (file convention — single source, replaces the old /aa-logo.png entry).
// Text-only on purpose: Satori is fragile with embedded image assets.
// Palette mirrors the marketing pages: #16181C bg, #F2F0EB text, #EE6B1A accent.
export const alt = 'Align and Acquire — Missed call text back for trades businesses'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#16181C',
          color: '#F2F0EB',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            marginBottom: 36,
          }}
        >
          <div style={{ width: 22, height: 22, backgroundColor: '#EE6B1A', display: 'flex' }} />
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 8,
              textTransform: 'uppercase',
              color: '#EE6B1A',
            }}
          >
            Missed call text back for trades businesses
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 118,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1,
          }}
        >
          Align and Acquire
        </div>
        <div
          style={{
            display: 'flex',
            width: 160,
            height: 8,
            backgroundColor: '#EE6B1A',
            marginTop: 48,
          }}
        />
      </div>
    ),
    { ...size }
  )
}
