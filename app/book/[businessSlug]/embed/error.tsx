'use client'

/** Catches render/mount errors in the embed so we can see them on mobile (no console). */
export default function EmbedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const msg = error?.message ?? String(error)
  const stack = error?.stack ?? ''
  return (
    <div
      data-embed-error
      style={{
        color: '#b91c1c',
        padding: 20,
        fontSize: 16,
        border: '2px solid #b91c1c',
        backgroundColor: '#fef2f2',
        minHeight: 120,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Embed error (mount/render):</div>
      <div style={{ marginBottom: 8 }}>{msg}</div>
      {stack && (
        <pre style={{ fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap', marginTop: 8 }}>{stack}</pre>
      )}
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: 12,
          padding: '8px 16px',
          backgroundColor: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
