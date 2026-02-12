/**
 * Nav logo using native <img> so the file isn't recompressed by Next.js Image,
 * which keeps it sharp. Use variant for light (dashboard) vs dark (nav/footer) backgrounds.
 */
export function Logo({
  size = 'sm',
  variant = 'dark',
  className = '',
}: {
  size?: 'xs' | 'sm' | 'lg'
  variant?: 'dark' | 'light'
  className?: string
}) {
  const sizeMap = { xs: { dim: 64, class: 'h-8 w-auto' }, sm: { dim: 120, class: 'h-9 w-auto' }, lg: { dim: 240, class: 'h-16 w-auto md:h-20' } }
  const { dim, class: sizeClass } = sizeMap[size]
  const variantClass = variant === 'light' ? 'drop-shadow-sm' : ''
  return (
    <img
      src="/images/portfolio/logo.png"
      alt="Align & Acquire"
      width={dim}
      height={dim}
      className={`object-contain ${sizeClass} ${variantClass} ${className}`.trim()}
      draggable={false}
      decoding="async"
    />
  )
}
