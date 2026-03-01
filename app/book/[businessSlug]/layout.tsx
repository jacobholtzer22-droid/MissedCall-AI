/** Force light mode for booking page - overrides root dark body */
export const metadata = {
  title: 'Schedule a Free In-Person Quote',
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen min-w-full"
      style={{ backgroundColor: '#f9fafb', color: '#111827', colorScheme: 'light' } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
