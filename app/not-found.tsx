import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center page-fade-in">
      <div className="text-center px-6 max-w-lg">
        <p className="text-8xl sm:text-9xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-6">
          404
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">
          This page got lost.
        </h1>
        <p className="text-gray-400 text-lg mb-8">
          Unlike your leads &mdash; we don&apos;t let those slip away.
        </p>
        <Link
          href="/"
          className="cta-hover inline-flex items-center bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-500 hover:to-purple-500 transition-all min-h-[44px]"
        >
          Take me home
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
