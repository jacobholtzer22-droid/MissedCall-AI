/** Force light mode for embed - overrides root dark body */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen min-w-full"
      style={{ backgroundColor: '#ffffff', color: '#111827', colorScheme: 'light' } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
