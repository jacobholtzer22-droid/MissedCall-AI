import Link from 'next/link'
import { CheckCircle, Phone } from 'lucide-react'

export default function DemoRequestedPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 text-white">
      <div className="max-w-md w-full text-center">
        <div className="bg-green-500/20 border border-green-500/30 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-10 w-10 text-green-400" />
        </div>
        <h1 className="text-3xl font-bold mb-4">Demo Request Received!</h1>
        <p className="text-gray-400 mb-8">
          Thanks for your interest in MissedCall AI. We'll reach out within 24 hours to schedule your free demo call.
        </p>
        <p className="text-gray-500 mb-8">
          Check your email for a confirmation.
        </p>
        <Link href="/" className="inline-flex items-center text-blue-400 hover:text-blue-300 font-medium transition">
          <Phone className="h-4 w-4 mr-2" />
          Back to Home
        </Link>
      </div>
    </div>
  )
}