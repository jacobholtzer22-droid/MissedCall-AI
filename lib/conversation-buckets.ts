export type ConversationBucket = 'cold' | 'active' | 'stalled' | 'closed'

export type ConversationForBucket = {
  status: string
  messages: { direction: string }[]
  lastMessageAt: Date | string
  customerEmail: string | null
  customerAddress: string | null
  customerTimeframe: string | null
  appointment: { id: string } | null
}

export function getConversationBucket(conv: ConversationForBucket): ConversationBucket {
  const isClosed = !!(
    conv.status === 'lead_captured' ||
    conv.status === 'appointment_booked' ||
    conv.appointment ||
    conv.customerEmail ||
    conv.customerAddress ||
    conv.customerTimeframe
  )
  if (isClosed) return 'closed'

  const hasInbound = conv.messages.some(m => m.direction === 'inbound')
  if (!hasInbound) return 'cold'

  const lastMsg = new Date(conv.lastMessageAt)
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
  return lastMsg > cutoff ? 'active' : 'stalled'
}

export const BUCKET_LABELS: Record<ConversationBucket, string> = {
  cold: 'Cold',
  active: 'Active',
  stalled: 'Stalled',
  closed: 'Closed',
}

export const BUCKET_COLORS: Record<ConversationBucket, string> = {
  cold: 'bg-gray-500/10 text-gray-400',
  active: 'bg-green-500/10 text-green-400',
  stalled: 'bg-yellow-500/10 text-yellow-400',
  closed: 'bg-blue-500/10 text-blue-400',
}
