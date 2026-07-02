import type { Metadata } from 'next'
import { SignUp } from '@clerk/nextjs'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function SignUpPage() {
  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6 pt-28 pb-16"
      style={{ background: '#16181C' }}
    >
      {/* Brand eyebrow */}
      <div className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.28em] mb-8">
        <span className="inline-block h-2.5 w-2.5" style={{ background: '#EE6B1A' }} />
        <span style={{ color: '#EE6B1A' }}>Align and Acquire · Get started</span>
      </div>

      <SignUp
        afterSignUpUrl="/onboarding"
        appearance={{
          variables: {
            colorPrimary: '#EE6B1A',
            colorBackground: '#1e2026',
            colorText: '#F2F0EB',
            colorTextSecondary: '#6E7681',
            colorInputBackground: 'rgba(242,240,235,0.06)',
            colorInputText: '#F2F0EB',
            colorNeutral: '#6E7681',
            borderRadius: '0px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '14px',
          },
          elements: {
            rootBox: 'mx-auto w-full max-w-md',
            card: 'shadow-none border-2 !rounded-none',
            cardBox: 'border-2 border-[rgba(110,118,129,0.35)]',
            headerTitle: 'font-black uppercase tracking-tight text-[22px]',
            headerSubtitle: 'text-[#6E7681] text-[13px]',
            formButtonPrimary: 'bg-[#EE6B1A] hover:brightness-110 text-[#16181C] font-bold uppercase tracking-wide !rounded-none transition-all active:scale-[0.97]',
            formFieldInput: 'border-2 border-[rgba(110,118,129,0.4)] focus:border-[#EE6B1A] !rounded-none bg-[rgba(242,240,235,0.06)] text-[#F2F0EB] transition-colors',
            formFieldLabel: 'text-[#6E7681] font-mono text-[11px] uppercase tracking-[0.2em] font-bold',
            footerActionLink: 'text-[#EE6B1A] hover:text-[#EE6B1A]/80 font-semibold',
            dividerLine: 'bg-[rgba(110,118,129,0.3)]',
            dividerText: 'text-[#6E7681] text-[11px] uppercase font-mono tracking-widest',
            socialButtonsBlockButton: 'border-2 border-[rgba(110,118,129,0.35)] !rounded-none hover:bg-[rgba(242,240,235,0.06)] transition-colors text-[#F2F0EB]',
            socialButtonsBlockButtonText: 'text-[#F2F0EB] font-semibold text-[13px]',
            identityPreviewText: 'text-[#F2F0EB]',
            identityPreviewEditButton: 'text-[#EE6B1A]',
            alertText: 'text-[13px]',
            formFieldSuccessText: 'text-[#EE6B1A]',
            otpCodeFieldInput: '!rounded-none border-2 border-[rgba(110,118,129,0.4)] focus:border-[#EE6B1A] bg-[rgba(242,240,235,0.06)] text-[#F2F0EB]',
          },
        }}
      />
    </div>
  )
}
