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
  const sizeMap = { xs: { dim: 80, class: 'h-10 w-auto' }, sm: { dim: 160, class: 'h-12 w-auto' }, lg: { dim: 320, class: 'h-20 w-auto md:h-24' } }
  const { dim, class: sizeClass } = sizeMap[size]
  const variantClass = variant === 'light' ? 'drop-shadow-sm' : ''
  return (
    <picture>
      <source srcSet="/images/portfolio/logo.webp" type="image/webp" />
      <img
        src="/images/portfolio/logo.png"
        alt="Align & Acquire"
        width={dim}
        height={dim}
        className={`object-contain ${sizeClass} ${variantClass} ${className}`.trim()}
        draggable={false}
        decoding="async"
      />
    </picture>
  )
}
