'use client'

import { useState } from 'react'
import { Code, Copy, Check } from 'lucide-react'

interface EmbedCodeSectionProps {
  businessSlug: string
  baseUrl: string
  /** Light theme for settings page, dark for admin */
  variant?: 'light' | 'dark'
}

export function EmbedCodeSection({ businessSlug, baseUrl, variant = 'light' }: EmbedCodeSectionProps) {
  const [copiedTab, setCopiedTab] = useState<'iframe' | 'script' | null>(null)

  const embedUrl = `${baseUrl.replace(/\/$/, '')}/book/${businessSlug}/embed`
  const scriptUrl = `${baseUrl.replace(/\/$/, '')}/embed.js`
  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" frameborder="0" style="min-height:600px"></iframe>`
  const scriptSnippet = `<script src="${scriptUrl}" data-business="${businessSlug}"></script>`

  async function copyToClipboard(text: string, tab: 'iframe' | 'script') {
    await navigator.clipboard.writeText(text)
    setCopiedTab(tab)
    setTimeout(() => setCopiedTab(null), 2000)
  }

  const isDark = variant === 'dark'
  const codeBg = isDark ? 'bg-gray-800' : 'bg-gray-100'
  const codeText = isDark ? 'text-gray-300' : 'text-gray-800'
  const labelColor = isDark ? 'text-gray-400' : 'text-gray-600'

  return (
    <div className={`rounded-lg border p-4 ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Code className={`h-4 w-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
        <h4 className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>Embed Code</h4>
      </div>
      <p className={`text-sm mb-4 ${labelColor}`}>
        Paste this into your website to show the booking calendar. Works on any site.
      </p>

      <div className="space-y-4">
        <div>
          <p className={`text-xs font-medium mb-1.5 ${labelColor}`}>Option 1: Iframe (paste into HTML)</p>
          <div className={`relative rounded-lg ${codeBg} p-3 overflow-x-auto`}>
            <code className={`text-xs font-mono ${codeText} block whitespace-pre`}>{iframeSnippet}</code>
            <button
              onClick={() => copyToClipboard(iframeSnippet, 'iframe')}
              className={`absolute top-2 right-2 p-1.5 rounded transition ${
                isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-200 text-gray-500 hover:text-gray-800'
              }`}
              title="Copy"
            >
              {copiedTab === 'iframe' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className={`text-xs mt-1 ${labelColor}`}>Auto-resizes when used with the script below, or use min-height as shown.</p>
        </div>

        <div>
          <p className={`text-xs font-medium mb-1.5 ${labelColor}`}>Option 2: JavaScript (auto-resizing)</p>
          <div className={`relative rounded-lg ${codeBg} p-3 overflow-x-auto`}>
            <code className={`text-xs font-mono ${codeText} block whitespace-pre`}>{scriptSnippet}</code>
            <button
              onClick={() => copyToClipboard(scriptSnippet, 'script')}
              className={`absolute top-2 right-2 p-1.5 rounded transition ${
                isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-200 text-gray-500 hover:text-gray-800'
              }`}
              title="Copy"
            >
              {copiedTab === 'script' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className={`text-xs mt-1 ${labelColor}`}>Injects an iframe that auto-resizes to fit the booking form. Add a container: <code className="px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700">&lt;div id=&quot;booking-widget&quot;&gt;&lt;/div&gt;</code></p>
        </div>
      </div>
    </div>
  )
}
