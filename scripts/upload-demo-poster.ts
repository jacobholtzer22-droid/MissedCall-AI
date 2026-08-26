// ===========================================
// UPLOAD THE DEMO VIDEO POSTER FRAME TO BLOB
// ===========================================
// Run: npx tsx scripts/upload-demo-poster.ts <path-to.jpg>
// Prints the URL to set as NEXT_PUBLIC_DEMO_POSTER_URL.
//
// Fixed Blob path with allowOverwrite, so re-running swaps the image without
// changing the URL and without needing an env change or a redeploy.

import * as dotenv from 'dotenv'
import { readFile, stat } from 'node:fs/promises'
import { put } from '@vercel/blob'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const BLOB_PATH = 'demo/founder-video-poster.jpg'

async function main() {
  const source = process.argv[2]
  if (!source) throw new Error('Usage: npx tsx scripts/upload-demo-poster.ts <path-to.jpg>')
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is not set.')

  const info = await stat(source).catch(() => null)
  if (!info) throw new Error(`File not found: ${source}`)
  console.log(`Uploading ${source} (${(info.size / 1024).toFixed(0)} KB) ...`)

  const blob = await put(BLOB_PATH, await readFile(source), {
    access: 'public',
    contentType: 'image/jpeg',
    addRandomSuffix: false,
    allowOverwrite: true,
  })

  console.log('')
  console.log('Uploaded.')
  console.log(`  NEXT_PUBLIC_DEMO_POSTER_URL=${blob.url}`)
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
