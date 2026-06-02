import { redirect } from 'next/navigation'

// Conversations now lives under the Leads area as the "Missed Call" tab.
// Old URL preserved for bookmarks/links.
export default function ConversationsPage() {
  redirect('/dashboard/leads')
}
