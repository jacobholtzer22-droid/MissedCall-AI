export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen min-w-full bg-white text-gray-900">
      {children}
    </div>
  )
}
