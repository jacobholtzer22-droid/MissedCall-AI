'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { UploadCloud, FileSpreadsheet, ArrowLeft, CheckCircle2, AlertTriangle } from 'lucide-react'

type RawRow = Record<string, string | number | boolean | null | undefined>

type CrmField =
  | 'name'
  | 'phone'
  | 'email'
  | 'address'
  | 'city'
  | 'state'
  | 'zip'
  | 'notes'
  | 'serviceHistory'

type MappingValue = CrmField | 'ignore'

type MappedContact = {
  name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  notes?: string
  serviceHistory?: string
}

const CRM_FIELD_LABELS: Record<CrmField, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  city: 'City',
  state: 'State',
  zip: 'Zip',
  notes: 'Notes',
  serviceHistory: 'Service History',
}

const SOURCE_OPTIONS = [
  { value: 'jobber_import', label: 'Jobber Import' },
  { value: 'servicetitan_import', label: 'ServiceTitan Import' },
  { value: 'housecallpro_import', label: 'Housecall Pro Import' },
  { value: 'quickbooks_import', label: 'QuickBooks Import' },
  { value: 'square_import', label: 'Square Import' },
  { value: 'excel_import', label: 'Excel Spreadsheet' },
  { value: 'google_contacts_import', label: 'Google Contacts' },
  { value: 'other_crm_import', label: 'Other CRM Import' },
  { value: 'manual_list', label: 'Manual List' },
] as const

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'done'

type ImportStats = {
  total: number
  withPhone: number
  withEmail: number
  duplicates: number
}

type ImportResult = {
  imported: number
  duplicates: number
  errors: number
}

function normalizeHeader(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function guessFieldForHeader(header: string, allHeaders: string[]): MappingValue {
  const normalized = normalizeHeader(header)

  const nameCandidates = ['name', 'full name', 'customer name', 'client name', 'contact name']
  if (nameCandidates.some((c) => normalized === c)) return 'name'
  if (normalized === 'first name' || normalized === 'last name') return 'name'

  const phoneCandidates = ['phone', 'phone number', 'telephone', 'mobile', 'cell', 'cell phone']
  if (phoneCandidates.some((c) => normalized === c)) return 'phone'

  const emailCandidates = ['email', 'e mail', 'email address', 'e-mail address']
  if (emailCandidates.some((c) => normalized === c)) return 'email'

  const addressCandidates = ['address', 'street', 'street address', 'address line 1']
  if (addressCandidates.some((c) => normalized === c)) return 'address'

  const cityCandidates = ['city', 'town']
  if (cityCandidates.some((c) => normalized === c)) return 'city'

  const stateCandidates = ['state', 'province', 'region']
  if (stateCandidates.some((c) => normalized === c)) return 'state'

  const zipCandidates = ['zip', 'zip code', 'postal code', 'postcode']
  if (zipCandidates.some((c) => normalized === c)) return 'zip'

  const notesCandidates = ['notes', 'comments', 'description', 'details']
  if (notesCandidates.some((c) => normalized === c)) return 'notes'

  const serviceHistoryCandidates = ['service history', 'job history', 'work history']
  if (serviceHistoryCandidates.some((c) => normalized === c)) return 'serviceHistory'

  // default: ignore
  return 'ignore'
}

export function ImportContactsClient() {
  const [step, setStep] = useState<ImportStep>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<RawRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, MappingValue>>({})
  const [source, setSource] = useState<string>('jobber_import')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewStats, setPreviewStats] = useState<ImportStats | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importingIndex, setImportingIndex] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    const lower = file.name.toLowerCase()
    setError(null)
    setFileName(file.name)
    setRows([])
    setHeaders([])
    setColumnMapping({})
    setPreviewStats(null)
    setImportResult(null)
    setStep('upload')

    if (lower.endsWith('.csv')) {
      Papa.parse<RawRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const parsedRows = (result.data || []).filter((r) => r && Object.keys(r).length > 0)
          const cols = result.meta.fields ?? Object.keys(parsedRows[0] ?? {})
          setRows(parsedRows)
          setHeaders(cols)
          const mapping: Record<string, MappingValue> = {}
          cols.forEach((h) => {
            mapping[h] = guessFieldForHeader(h, cols)
          })
          setColumnMapping(mapping)
          setStep('mapping')
        },
        error: (err) => {
          console.error(err)
          setError('Failed to parse CSV file. Please check the format.')
        },
      })
      return
    }

    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[firstSheetName]
          const json: RawRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })
          const cols = Object.keys(json[0] ?? {})
          setRows(json)
          setHeaders(cols)
          const mapping: Record<string, MappingValue> = {}
          cols.forEach((h) => {
            mapping[h] = guessFieldForHeader(h, cols)
          })
          setColumnMapping(mapping)
          setStep('mapping')
        } catch (err) {
          console.error(err)
          setError('Failed to read Excel file. Please check the format.')
        }
      }
      reader.onerror = () => {
        setError('Failed to read file. Please try again.')
      }
      reader.readAsArrayBuffer(file)
      return
    }

    setError('Unsupported file type. Please upload a CSV or Excel file.')
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const files = e.dataTransfer.files
      handleFiles(files)
    },
    [handleFiles]
  )

  const previewRows = useMemo(() => rows.slice(0, 5), [rows])

  const mappedContacts: MappedContact[] = useMemo(() => {
    if (rows.length === 0 || headers.length === 0) return []

    const combineNameFromFirstLast = (row: RawRow): string | undefined => {
      const normalizedHeaders = headers.map((h) => normalizeHeader(h))
      const hasFirst = normalizedHeaders.includes('first name')
      const hasLast = normalizedHeaders.includes('last name')
      if (!hasFirst || !hasLast) return undefined

      const firstIndex = normalizedHeaders.indexOf('first name')
      const lastIndex = normalizedHeaders.indexOf('last name')
      const firstHeader = headers[firstIndex]
      const lastHeader = headers[lastIndex]

      const first = String(row[firstHeader] ?? '').trim()
      const last = String(row[lastHeader] ?? '').trim()
      if (!first && !last) return undefined
      return [first, last].filter(Boolean).join(' ')
    }

    return rows.map((row) => {
      const contact: MappedContact = {}

      headers.forEach((header) => {
        const mapping = columnMapping[header]
        if (!mapping || mapping === 'ignore') return
        const rawValue = row[header]
        const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue == null ? '' : String(rawValue)
        if (!value) return

        if (mapping === 'name') {
          const combined = combineNameFromFirstLast(row)
          contact.name = combined || value
        } else if (mapping === 'serviceHistory') {
          contact.serviceHistory = contact.serviceHistory ? `${contact.serviceHistory}; ${value}` : value
        } else if (mapping === 'notes') {
          contact.notes = contact.notes ? `${contact.notes}\n${value}` : value
        } else {
          ;(contact as any)[mapping] = value
        }
      })

      return contact
    })
  }, [rows, headers, columnMapping])

  const computedStats = useMemo<ImportStats>(() => {
    const total = mappedContacts.length
    let withPhone = 0
    let withEmail = 0

    mappedContacts.forEach((c) => {
      if (c.phone && c.phone.replace(/\D/g, '').length >= 10) withPhone += 1
      if (c.email && c.email.includes('@')) withEmail += 1
    })

    return {
      total,
      withPhone,
      withEmail,
      duplicates: previewStats?.duplicates ?? 0,
    }
  }, [mappedContacts, previewStats])

  async function runPreview() {
    setLoadingPreview(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          contacts: mappedContacts,
          dryRun: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze import')
      }
      const dup = typeof data.duplicates === 'number' ? data.duplicates : 0
      setPreviewStats({
        total: mappedContacts.length,
        withPhone: computedStats.withPhone,
        withEmail: computedStats.withEmail,
        duplicates: dup,
      })
      setStep('preview')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to analyze import')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function runImport() {
    setStep('importing')
    setImportResult(null)
    setImportTotal(mappedContacts.length)
    setImportingIndex(0)
    setError(null)

    try {
      const res = await fetch('/api/dashboard/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source,
          contacts: mappedContacts,
          dryRun: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import contacts')
      }
      const result: ImportResult = {
        imported: data.imported ?? 0,
        duplicates: data.duplicates ?? 0,
        errors: data.errors ?? 0,
      }
      setImportResult(result)
      setImportingIndex(mappedContacts.length)
      setStep('done')
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Failed to import contacts')
      setStep('preview')
    }
  }

  const progressPercent =
    importTotal > 0 ? Math.round((Math.min(importingIndex, importTotal) / importTotal) * 100) : 0

  const canContinueToPreview =
    mappedContacts.length > 0 &&
    (mappedContacts.some((c) => c.phone && c.phone.replace(/\D/g, '').length >= 10) ||
      mappedContacts.some((c) => c.email && c.email.includes('@')))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/contacts"
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Contacts</h1>
          <p className="text-gray-500 mt-1">
            Upload a CSV or Excel file from any system and map the columns to your CRM fields.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'upload' || step === 'mapping' || step === 'preview' || step === 'importing' || step === 'done'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              1
            </div>
            <div>
              <div className="font-medium text-gray-900">Upload file</div>
              <div className="text-gray-500 text-xs">CSV, XLSX, or XLS</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'mapping' || step === 'preview' || step === 'importing' || step === 'done'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              2
            </div>
            <div>
              <div className="font-medium text-gray-900">Map columns</div>
              <div className="text-gray-500 text-xs">Tell us what each column means</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'preview' || step === 'importing' || step === 'done'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              3
            </div>
            <div>
              <div className="font-medium text-gray-900">Review</div>
              <div className="text-gray-500 text-xs">See how many will import</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'done' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              4
            </div>
            <div>
              <div className="font-medium text-gray-900">Import</div>
              <div className="text-gray-500 text-xs">Create contacts in your CRM</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr,3fr] gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-3 min-h-[44px] border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                This will be applied to all imported contacts so you can see where they came from.
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDrop={onDrop}
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 min-h-[120px] md:min-h-[160px] flex flex-col items-center justify-center text-center cursor-pointer hover:border-gray-400 transition bg-gray-50 touch-manipulation"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.csv,.xlsx,.xls'
                input.onchange = (e: any) => handleFiles(e.target.files)
                input.click()
              }}
            >
              <div className="w-12 h-12 rounded-full bg-gray-900/5 flex items-center justify-center mb-3">
                <UploadCloud className="h-6 w-6 text-gray-700" />
              </div>
              <p className="text-sm font-medium text-gray-900">
                Drag and drop a file, or click to browse
              </p>
              <p className="text-xs text-gray-500 mt-1">CSV, XLSX, or XLS up to 10MB</p>
              {fileName && (
                <p className="mt-3 inline-flex items-center gap-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-full px-3 py-1">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  {fileName}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {step === 'mapping' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900">Column mapping</h3>
                </div>
                <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {headers.map((h) => (
                    <div key={h} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2 bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{h}</div>
                      </div>
                      <select
                        value={columnMapping[h] ?? 'ignore'}
                        onChange={(e) =>
                          setColumnMapping((prev) => ({
                            ...prev,
                            [h]: e.target.value as MappingValue,
                          }))
                        }
                        className="w-full sm:w-auto text-sm px-3 py-3 min-h-[44px] sm:min-h-0 sm:py-1 sm:px-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-900"
                      >
                        <option value="ignore">Ignore this column</option>
                        {Object.entries(CRM_FIELD_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {headers.length === 0 && (
                    <div className="px-3 py-4 text-sm text-gray-500 text-center bg-gray-50">
                      Upload a file to configure column mappings.
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 'preview' && previewStats && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-900">Import summary</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Total rows</div>
                    <div className="text-lg font-semibold text-gray-900 mt-1">
                      {previewStats.total}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">With phone numbers</div>
                    <div className="text-lg font-semibold text-gray-900 mt-1">
                      {previewStats.withPhone}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">With email addresses</div>
                    <div className="text-lg font-semibold text-gray-900 mt-1">
                      {previewStats.withEmail}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-xs text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Possible duplicates
                    </div>
                    <div className="text-lg font-semibold text-amber-900 mt-1">
                      {previewStats.duplicates}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Contacts are considered duplicates if their phone number or email already exists in
                  your CRM. Duplicates will be skipped during import.
                </p>
              </div>
            )}

            {step === 'done' && importResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Import completed</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="text-xs text-emerald-700">Imported</div>
                    <div className="text-lg font-semibold text-emerald-900 mt-1">
                      {importResult.imported}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="text-xs text-amber-700">Duplicates skipped</div>
                    <div className="text-lg font-semibold text-amber-900 mt-1">
                      {importResult.duplicates}
                    </div>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="text-xs text-red-700">Errors</div>
                    <div className="text-lg font-semibold text-red-900 mt-1">
                      {importResult.errors}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Preview (first 5 rows)</h3>
              <span className="text-xs text-gray-500">
                {mappedContacts.length} mapped rows
              </span>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              {headers.length === 0 || previewRows.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500 bg-gray-50">
                  Upload a file to see a preview of your data.
                </div>
              ) : (
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">
                          <div>{h}</div>
                          <div className="text-[10px] text-gray-400">
                            {columnMapping[h] && columnMapping[h] !== 'ignore'
                              ? CRM_FIELD_LABELS[columnMapping[h] as CrmField]
                              : 'Ignored'}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        {headers.map((h) => (
                          <td key={h} className="px-3 py-1.5 text-gray-700">
                            {String(row[h] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {(step === 'mapping' || step === 'preview' || step === 'done') && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="text-xs text-gray-500">
                  {computedStats.total > 0 && (
                    <>
                      <span className="font-medium text-gray-900">{computedStats.total}</span> rows •{' '}
                      <span className="font-medium text-gray-900">{computedStats.withPhone}</span> with
                      phone •{' '}
                      <span className="font-medium text-gray-900">{computedStats.withEmail}</span> with
                      email
                    </>
                  )}
                </div>
                <div className="flex gap-2 justify-end">
                  {step === 'mapping' && (
                    <button
                      type="button"
                      onClick={runPreview}
                      disabled={!canContinueToPreview || loadingPreview}
                      className="inline-flex items-center justify-center px-4 py-3 min-h-[44px] rounded-lg border border-gray-200 bg-gray-900 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingPreview ? 'Analyzing…' : 'Next: Review import'}
                    </button>
                  )}
                  {step === 'preview' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setStep('mapping')}
                        className="px-4 py-3 min-h-[44px] rounded-lg border border-gray-200 text-sm text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Back to mapping
                      </button>
                      <button
                        type="button"
                        onClick={runImport}
                        className="px-4 py-3 min-h-[44px] rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
                      >
                        Import contacts
                      </button>
                    </>
                  )}
                  {step === 'done' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setStep('upload')
                          setRows([])
                          setHeaders([])
                          setColumnMapping({})
                          setFileName(null)
                          setPreviewStats(null)
                          setImportResult(null)
                          setImportTotal(0)
                          setImportingIndex(0)
                          setError(null)
                        }}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white hover:bg-gray-50"
                      >
                        Start a new import
                      </button>
                      <Link
                        href="/dashboard/contacts"
                        className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 inline-flex items-center justify-center"
                      >
                        Back to contacts
                      </Link>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === 'importing' && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">Importing contacts…</span>
                  <span className="text-gray-500">
                    {importingIndex} / {importTotal}
                  </span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-900 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

