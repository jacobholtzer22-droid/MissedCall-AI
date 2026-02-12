/**
 * Nav logo using native <img> so the file isn't recompressed by Next.js Image,
 * which keeps it sharp. For best quality, use a 120×120 (nav) or 240×240 (hero) PNG.
 */
export function Logo({
  size = 'sm',
  className = '',
}: {
  size?: 'sm' | 'lg'
  className?: string
}) {
  const dim = size === 'lg' ? 240 : 120
  const sizeClass = size === 'lg' ? 'h-20 w-auto' : 'h-10 w-auto'
  return (
    <img
      src="/images/portfolio/logo.png"
      alt="Align & Acquire"
      width={dim}
      height={dim}
      className={`${sizeClass} ${className}`.trim()}
      draggable={false}
      decoding="async"
    />
  )
}
