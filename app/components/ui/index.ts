// Shared dashboard UI primitives. Additive — consumed by the Overview page in
// this pass; other dashboard pages can adopt these incrementally.
export { Card, CardHeader, CardTitle, CardSubtitle, CardBody } from './Card'
export { Button, buttonClasses } from './Button'
export type { ButtonVariant, ButtonSize } from './Button'
export { Badge, StatusBadge } from './Badge'
export type { BadgeTone } from './Badge'
export { PageHeader } from './PageHeader'
export { MetricCard } from './MetricCard'
export type { MetricCardProps, Trend } from './MetricCard'
export { PeriodSelector, PERIOD_OPTIONS, periodLabel } from './PeriodSelector'
export type { Period } from './PeriodSelector'
export { Skeleton, LoadingState, EmptyState, ErrorState } from './states'
