'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Mailbox, Plus, Copy } from 'lucide-react'

type Campaign = {
  id: string
  subject: string
  status: string
  recipientCount: number
  sentAt: string | null
  createdAt: string
}

export function EmailsClient({ hideHeader = false }: { hideHeader?: boolean }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/emails')
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(data.campaigns ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const sentCampaigns = useMemo(() => {
    return campaigns
      .filter((c) => c.status === 'sent')
      .sort((a, b) => {
        const aTime = a.sentAt ? new Date(a.sentAt).getTime() : new Date(a.createdAt).getTime()
        const bTime = b.sentAt ? new Date(b.sentAt).getTime() : new Date(b.createdAt).getTime()
        return bTime - aTime
      })
  }, [campaigns])

  return (
    <div className="space-y-6 w-full">
      {!hideHeader && (
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Campaigns</h1>
          <p className="text-gray-500 mt-1">Send bulk emails to your contacts</p>
        </div>
        <Link
          href="/dashboard/emails/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-3 min-h-[44px] w-full md:w-auto bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition font-medium"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </Link>
      </div>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Sent Campaigns</h2>
        <p className="text-sm text-gray-500">
          Reuse any previously sent campaign as a starting point for a new one.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden w-full">
        {loading ? (
          <div className="py-16 text-center text-gray-500">Loading...</div>
        ) : sentCampaigns.length === 0 ? (
          <div className="py-16 text-center">
            <Mailbox className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No sent campaigns yet.</p>
            <Link
              href="/dashboard/emails/new"
              className="mt-4 inline-flex items-center justify-center min-h-[44px] px-4 py-3 text-gray-900 font-medium rounded-lg hover:bg-gray-100"
            >
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Subject</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Sent</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Recipients</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sentCampaigns.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{c.subject}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {c.sentAt ? new Date(c.sentAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{c.recipientCount}</td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/dashboard/emails/new?templateId=${c.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Reuse as Template
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
