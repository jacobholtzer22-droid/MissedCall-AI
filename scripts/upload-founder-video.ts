// ===========================================
// UPLOAD THE FOUNDER VIDEO TO VERCEL BLOB
// ===========================================
// The MP4 is ~59MB and is gitignored on purpose. This puts it on Blob and
// prints the URL to set as NEXT_PUBLIC_DEMO_VIDEO_URL.
//
// Run: npx tsx scripts/upload-founder-video.ts "./ Founder Video for funnel.mp4"
// Requires BLOB_READ_WRITE_TOKEN (already set for voicemail + campaign images).

import * as dotenv from 'dotenv'
import { readFile, stat } from 'node:fs/promises'
import { put } from '@vercel/blob'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

const DEFAULT_SOURCE = ' Founder Video for funnel.mp4'
const BLOB_PATH = 'demo/founder-video.mp4'

async function main() {
  const source = process.argv[2] ?? DEFAULT_SOURCE
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set. Pull it with `vercel env pull` or export it.')
  }

  const info = await stat(source).catch(() => null)
  if (!info) throw new Error(`File not found: ${source}`)
  console.log(`Uploading ${source} (${(info.size / 1024 / 1024).toFixed(1)} MB) ...`)

  const body = await readFile(source)
  // access:'public' is required at creation and cannot be changed afterwards.
  const blob = await put(BLOB_PATH, body, {
    access: 'public',
    contentType: 'video/mp4',
    addRandomSuffix: false,
    allowOverwrite: true,
  })

  console.log('')
  console.log('Uploaded.')
  console.log(`  URL: ${blob.url}`)
  console.log('')
  console.log('Next: set this in Vercel (Production + Preview), then redeploy.')
  console.log(`  NEXT_PUBLIC_DEMO_VIDEO_URL=${blob.url}`)
  console.log('NEXT_PUBLIC_* is inlined at build time, so a redeploy is required.')
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  process.exit(1)
})
