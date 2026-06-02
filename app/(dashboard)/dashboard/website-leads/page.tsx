import { redirect } from 'next/navigation'

// Website leads now live under the Leads area as the "Website" tab.
// Old URL preserved for bookmarks/links.
export default function WebsiteLeadsPage() {
  redirect('/dashboard/leads?tab=website')
}
