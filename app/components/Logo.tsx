/**
 * Primary logo — uses the original AA arrow lockup (public/aa-logo.png, 751×507).
 * Native <img> keeps it sharp (no Next.js recompression).
 */
export function Logo({
  size = 'sm',
  variant: _variant,
  className = '',
}: {
  size?: 'xs' | 'sm' | 'lg'
  /** @deprecated kept for backward-compat with dashboard components */
  variant?: 'dark' | 'light'
  className?: string
}) {
  const sizeClass = {
    xs: 'h-8 w-auto',
    sm: 'h-10 w-auto',
    lg: 'h-14 w-auto md:h-16',
  }[size]

  return (
    <img
      src="/aa-logo.png"
      alt="Align and Acquire"
      className={`object-contain ${sizeClass} ${className}`.trim()}
      draggable={false}
      decoding="async"
    />
  )
}
