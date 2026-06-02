'use client'

import { useRouter } from 'next/navigation'
import { CombinedLeadsList } from './CombinedLeadsList'

export function LeadsClient() {
  const router = useRouter()

  // Conversations is its own page again — open the thread there with it selected.
  function openConversation(conversationId: string) {
    router.push(`/dashboard/conversations?selected=${encodeURIComponent(conversationId)}`)
  }

  return <CombinedLeadsList onOpenConversation={openConversation} />
}
