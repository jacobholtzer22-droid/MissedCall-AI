import { Lock, Wrench } from 'lucide-react'

type LockedProps = {
  mode: 'locked'
  feature: string
  valueProp: string
  businessName: string
}

type NeedsSetupProps = {
  mode: 'needs-setup'
  feature: string
  setupDescription: string
  setupLabel: string
  setupHref: string
}

type FeatureGateProps = (LockedProps | NeedsSetupProps) & {
  enabled: boolean
  children: React.ReactNode
}

export function FeatureGate({ enabled, children, ...rest }: FeatureGateProps) {
  if (enabled) return <>{children}</>

  const subject =
    rest.mode === 'locked'
      ? `Unlock ${rest.feature} for ${rest.businessName}`
      : undefined

  return (
    <div className="relative min-h-[400px]">
      <div className="pointer-events-none select-none blur-sm opacity-40" aria-hidden>
        {children}
      </div>

      <div className="absolute inset-0 flex items-start justify-center pt-24">
        <div className="bg-gray-900/95 border border-gray-700 rounded-2xl px-8 py-7 text-center max-w-sm shadow-2xl backdrop-blur-sm">
          <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-3">
            {rest.mode === 'locked' ? (
              <Lock className="h-5 w-5 text-gray-400" />
            ) : (
              <Wrench className="h-5 w-5 text-gray-400" />
            )}
          </div>

          <h3 className="text-base font-semibold text-white mb-1">{rest.feature}</h3>

          {rest.mode === 'locked' ? (
            <>
              <p className="text-sm text-gray-400 mb-4">{rest.valueProp}</p>
              <a
                href={`mailto:jacob@alignandacquire.com?subject=${encodeURIComponent(subject!)}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium text-white transition"
              >
                Contact us to unlock
              </a>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-4">{rest.setupDescription}</p>
              <a
                href={rest.setupHref}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium text-white transition"
              >
                {rest.setupLabel}
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
