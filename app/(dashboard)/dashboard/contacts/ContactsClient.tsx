'use client'

// ===========================================
// CONTACTS CLIENT COMPONENT
// ===========================================
// Handles the interactive parts of the contacts import page:
// file upload, text paste, import, and delete operations.

import { useState, useRef } from 'react'
import { Upload, Trash2, Users, CheckCircle, AlertCircle, X } from 'lucide-react'

interface Contact {
  id: string
  phoneNumber: string
  label: string | null
  createdAt: Date | string
}

interface ImportResult {
  ok: boolean
  imported: number
  skipped: number
  total: number
  message: string
}

interface Props {
  initialContacts: Contact[]
}

export function ContactsClient({ initialContacts }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [pastedNumbers, setPastedNumbers] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // -------------------------
  // Import contacts
  // -------------------------
  async function handleImport() {
    if (!pastedNumbers.trim() && !selectedFile) {
      setError('Paste some phone numbers or choose a file to import.')
      return
    }

    setImporting(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      if (selectedFile) formData.append('file', selectedFile)
      if (pastedNumbers.trim()) formData.append('numbers', pastedNumbers)

      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Import failed. Please try again.')
        return
      }

      setResult(data as ImportResult)
      setPastedNumbers('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

      // Refresh contact list
      const listRes = await fetch('/api/contacts')
      if (listRes.ok) {
        const listData = await listRes.json()
        setContacts(listData.contacts)
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setImporting(false)
    }
  }

  // -------------------------
  // Delete one contact
  // -------------------------
  async function handleDeleteOne(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/contacts?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id))
      }
    } finally {
      setDeletingId(null)
    }
  }

  // -------------------------
  // Delete all contacts
  // -------------------------
  async function handleDeleteAll() {
    if (!confirm(`Remove all ${contacts.length} imported contacts? They may receive automated texts again.`)) return
    setDeletingAll(true)
    try {
      const res = await fetch('/api/contacts?all=1', { method: 'DELETE' })
      if (res.ok) {
        setContacts([])
        setResult(null)
      }
    } finally {
      setDeletingAll(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-50 p-3 rounded-lg">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{contacts.length}</p>
            <p className="text-sm text-gray-500">
              {contacts.length === 1 ? 'personal contact imported' : 'personal contacts imported'}
            </p>
          </div>
        </div>
        {contacts.length > 0 && (
          <p className="mt-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            These {contacts.length} {contacts.length === 1 ? 'person' : 'people'} won't receive
            automated texts when you miss their call.
          </p>
        )}
      </div>

      {/* Import form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Import Contacts</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload a contacts file (CSV or VCF/vCard from your phone) or paste numbers directly.
          </p>
        </div>

        {/* How to export instructions */}
        <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-1">
          <p className="font-medium">How to export your contacts:</p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-700">
            <li>
              <strong>iPhone:</strong> Open Contacts app → select all → Share → export as VCF
            </li>
            <li>
              <strong>Android:</strong> Open Contacts app → Settings → Export → save as VCF
            </li>
            <li>
              <strong>Google Contacts:</strong> contacts.google.com → Export → vCard (.vcf)
            </li>
            <li>
              <strong>Manual:</strong> Paste numbers below, one per line
            </li>
          </ul>
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Upload contacts file (.vcf or .csv)
          </label>
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file) setSelectedFile(file)
            }}
          >
            <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm text-gray-700 font-medium">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Drag & drop a file here, or{' '}
                <span className="text-blue-600 font-medium">click to browse</span>
              </p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vcf,.csv,.txt,text/vcard,text/csv,text/plain"
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Paste numbers */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Or paste phone numbers (one per line)
          </label>
          <textarea
            rows={6}
            value={pastedNumbers}
            onChange={(e) => setPastedNumbers(e.target.value)}
            placeholder={`+12025551234\n(202) 555-5678, John Smith\n202-555-9012`}
            className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Optionally add a name after a comma: <code>202-555-1234, Jane Doe</code>
          </p>
        </div>

        {/* Feedback */}
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {result && (
          <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{result.message}</span>
          </div>
        )}

        {/* Import button */}
        <button
          type="button"
          onClick={handleImport}
          disabled={importing || (!pastedNumbers.trim() && !selectedFile)}
          className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
        >
          {importing ? 'Importing...' : 'Import Contacts'}
        </button>
      </div>

      {/* Contact list */}
      {contacts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">
              Imported Contacts ({contacts.length})
            </h2>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deletingAll}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deletingAll ? 'Removing...' : 'Remove all'}
            </button>
          </div>
          <ul className="divide-y divide-gray-100">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-mono text-gray-900">{contact.phoneNumber}</p>
                  {contact.label && (
                    <p className="text-xs text-gray-500">{contact.label}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteOne(contact.id)}
                  disabled={deletingId === contact.id}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition"
                  title="Remove contact"
                >
                  {deletingId === contact.id ? (
                    <span className="text-xs text-gray-400">...</span>
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
