'use client'

import { useState } from 'react'
import { MessagesSquare, Globe } from 'lucide-react'
import { ConversationsClient } from '../conversations/ConversationsClient'
import { WebsiteLeadsClient } from '../website-leads/WebsiteLeadsClient'

type LeadTab = 'missed-call' | 'website'

export function LeadsClient({ defaultTab = 'missed-call' }: { defaultTab?: LeadTab }) {
  const [tab, setTab] = useState<LeadTab>(defaultTab)

  return (
    <div className="space-y-6">
      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setTab('missed-call')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'missed-call'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessagesSquare className="h-4 w-4" />
          Missed Call
        </button>
        <button
          onClick={() => setTab('website')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === 'website'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Globe className="h-4 w-4" />
          Website
        </button>
      </div>

      {tab === 'missed-call' ? <ConversationsClient embedded /> : <WebsiteLeadsClient />}
    </div>
  )
}
