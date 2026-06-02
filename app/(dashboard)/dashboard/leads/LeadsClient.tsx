'use client'

import { useState } from 'react'
import { Inbox, MessagesSquare } from 'lucide-react'
import { ConversationsClient } from '../conversations/ConversationsClient'
import { CombinedLeadsList } from './CombinedLeadsList'

type LeadTab = 'leads' | 'conversations'

export function LeadsClient({ defaultTab = 'leads' }: { defaultTab?: LeadTab }) {
  const [tab, setTab] = useState<LeadTab>(defaultTab)
  // Set when a Missed Call row is opened from the combined list → selects that
  // thread inside the Conversations tab.
  const [selectConversationId, setSelectConversationId] = useState<string | null>(null)

  function openConversation(conversationId: string) {
    setSelectConversationId(conversationId)
    setTab('conversations')
  }

  const tabBtn = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`

  return (
    <div className="space-y-6">
      {/* Tab selector */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button onClick={() => setTab('leads')} className={tabBtn(tab === 'leads')}>
          <Inbox className="h-4 w-4" />
          Leads
        </button>
        <button
          onClick={() => {
            // Manual switch shows the normal thread list (no forced selection).
            setSelectConversationId(null)
            setTab('conversations')
          }}
          className={tabBtn(tab === 'conversations')}
        >
          <MessagesSquare className="h-4 w-4" />
          Conversations
        </button>
      </div>

      {tab === 'leads' ? (
        <CombinedLeadsList onOpenConversation={openConversation} />
      ) : (
        <ConversationsClient embedded selectConversationId={selectConversationId} />
      )}
    </div>
  )
}
