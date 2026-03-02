import Script from 'next/script'

/** Force light mode for embed - overrides root dark body */
export const metadata = {
  title: 'Schedule a Free In-Person Quote',
}

/** Inline script runs before React so we can see JS errors on mobile (no console). */
const EMBED_ERROR_SCRIPT = `
window.onerror = function(msg, url, line) {
  var el = document.createElement('div');
  el.setAttribute('data-embed-error', '1');
  el.style.cssText = 'color:red;padding:20px;font-size:16px;background:#fff;z-index:9999;border:2px solid red;';
  el.textContent = 'ERROR: ' + msg + ' at ' + (url || '') + ':' + line;
  document.body.appendChild(el);
};
window.onunhandledrejection = function(e) {
  var el = document.createElement('div');
  el.setAttribute('data-embed-error', '1');
  el.style.cssText = 'color:red;padding:20px;font-size:16px;background:#fff;z-index:9999;border:2px solid red;';
  el.textContent = 'UNHANDLED REJECTION: ' + (e.reason && (e.reason.message || String(e.reason))) || 'Unknown';
  document.body.appendChild(el);
};
`

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script id="embed-error-handler" strategy="beforeInteractive">
        {EMBED_ERROR_SCRIPT}
      </Script>
      <div
        className="min-h-screen min-w-full"
        style={{ backgroundColor: '#ffffff', color: '#111827', colorScheme: 'light' } as React.CSSProperties}
      >
        {children}
      </div>
    </>
  )
}
