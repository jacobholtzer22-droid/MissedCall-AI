interface MarqueeProps {
  items: string[]
  separator?: string
  speed?: 'slow' | 'normal' | 'fast'
  className?: string
  reverse?: boolean
}

const speedMap = {
  slow: '45s',
  normal: '30s',
  fast: '20s',
}

export default function Marquee({ items, separator = '✦', speed = 'normal', className = '', reverse = false }: MarqueeProps) {
  const content = items.join(` ${separator} `) + ` ${separator} `
  const doubled = content + content

  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div
        className="marquee-track animate-marquee inline-flex"
        style={{
          ['--marquee-duration' as string]: speedMap[speed],
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        <span className="inline-block px-2">{doubled}</span>
        <span className="inline-block px-2">{doubled}</span>
      </div>
    </div>
  )
}
