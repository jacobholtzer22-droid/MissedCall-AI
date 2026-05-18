'use client'

import { useState } from 'react'
import { Mail, MessageCircle } from 'lucide-react'
import { EmailsClient } from '../emails/EmailsClient'
import { MessagesClient } from '../messages/MessagesClient'

type Channel = 'email' | 'sms'

export function OutreachClient() {
  const [channel, setChannel] = useState<Channel>('email')

  return (
    <div className="space-y-6">
      {/* Channel selector */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setChannel('email')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            channel === 'email'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Mail className="h-4 w-4" />
          Email
        </button>
        <button
          onClick={() => setChannel('sms')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            channel === 'sms'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          SMS
        </button>
      </div>

      {channel === 'email' ? (
        <EmailsClient hideHeader />
      ) : (
        <MessagesClient hideHeader />
      )}
    </div>
  )
}
