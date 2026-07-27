/**
 * Normalize existing BlockedNumber rows to E.164 format.
 *
 * READ-ONLY by default: prints what it would change.
 * Pass --apply to actually update the database.
 *
 * Handles unique-constraint collisions: if normalizing row A would conflict
 * with an existing row B (same businessId + E.164), the script skips A and
 * reports the collision — no data is lost.
 *
 * Usage:
 *   npx tsx scripts/normalize-blocked-numbers.ts          # dry run
 *   npx tsx scripts/normalize-blocked-numbers.ts --apply   # write changes
 *
 * Requires: DATABASE_URL
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function normalizeToE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 10) return `+1${digits.slice(-10)}`
  return ''
}

async function main() {
  const applyMode = process.argv.includes('--apply')
  console.log(`\n  BlockedNumber normalization — ${applyMode ? 'APPLY mode (will write)' : 'DRY RUN (read-only)'}\n`)
  console.log('─'.repeat(80))

  const rows = await prisma.blockedNumber.findMany({
    select: { id: true, businessId: true, phoneNumber: true, label: true },
  })

  let alreadyNormalized = 0
  let wouldChange = 0
  let skippedCollision = 0
  let skippedUnparseable = 0
  let updated = 0

  for (const row of rows) {
    const e164 = normalizeToE164(row.phoneNumber)

    if (!e164) {
      skippedUnparseable++
      console.log(`  SKIP (unparseable)  id=${row.id}  phone="${row.phoneNumber}"  business=${row.businessId}`)
      continue
    }

    if (row.phoneNumber === e164) {
      alreadyNormalized++
      continue
    }

    wouldChange++
    console.log(`  CHANGE  "${row.phoneNumber}" → "${e164}"  label=${row.label ?? '(null)'}  business=${row.businessId}`)

    if (!applyMode) continue

    // Check for collision: another row already has this (businessId, e164)
    const existing = await prisma.blockedNumber.findUnique({
      where: { businessId_phoneNumber: { businessId: row.businessId, phoneNumber: e164 } },
    })

    if (existing && existing.id !== row.id) {
      skippedCollision++
      console.log(`    COLLISION — row id=${existing.id} already has (${row.businessId}, ${e164}) — skipping`)
      continue
    }

    try {
      await prisma.blockedNumber.update({
        where: { id: row.id },
        data: { phoneNumber: e164 },
      })
      updated++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      skippedCollision++
      console.log(`    ERROR updating id=${row.id}: ${msg}`)
    }
  }

  console.log('─'.repeat(80))
  console.log(`\n  Total rows:          ${rows.length}`)
  console.log(`  Already E.164:       ${alreadyNormalized}`)
  console.log(`  Would change:        ${wouldChange}`)
  console.log(`  Skipped (collision): ${skippedCollision}`)
  console.log(`  Skipped (unparseable): ${skippedUnparseable}`)
  if (applyMode) {
    console.log(`  Actually updated:    ${updated}`)
  }
  console.log()

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
