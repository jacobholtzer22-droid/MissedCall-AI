import Link from 'next/link'
import { CheckCircle, Phone } from 'lucide-react'

export default function DemoRequestedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Demo Request Received!</h1>
        <p className="text-gray-600 mb-8">
          Thanks for your interest in MissedCall AI. Well reach out within 24 hours to schedule your personalized demo.
        </p>
        <p className="text-gray-500 mb-8">
          Check your email for a confirmation.
        </p>
        <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium">
          <Phone className="h-4 w-4 mr-2" />
          Back to Home
        </Link>
      </div>
    </div>
  )
}