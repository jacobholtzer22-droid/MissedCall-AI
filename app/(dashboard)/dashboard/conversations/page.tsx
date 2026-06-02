import { redirect } from 'next/navigation'

// Conversations now lives under the Leads area as the "Conversations" tab.
// Old URL preserved for bookmarks/links.
export default function ConversationsPage() {
  redirect('/dashboard/leads?tab=conversations')
}
