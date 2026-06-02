/**
 * Build 1, Step 2 — Backfill Contact.isClientContact.
 *
 * SAFE BY DEFAULT: runs as a DRY RUN and only prints what WOULD change.
 * Pass --apply to actually write. DO NOT run against prod until the counts
 * below are approved and the schema column already exists (Step 1).
 *
 *   Dry run:  npx tsx scripts/backfill-isClientContact.ts
 *   Apply:    npx tsx scripts/backfill-isClientContact.ts --apply
 *
 * Mapping (the FALSE bucket is already false via the DB default, so we only
 * UPDATE the TRUE bucket):
 *   TRUE  → source IS NULL (admin-curated lists) + any "*_import" source + manual / manual_list
 *   FALSE → missed_call, website_form, sms_conversation, google_ad  (left as-is)
 *   referral → UNDECIDED — left FALSE by default. Set INCLUDE_REFERRAL=true to flip it.
 */
import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

// Sources that are explicitly the client's own saved contacts.
const MANUAL_SOURCES = ['manual', 'manual_list']
// referral is ambiguous per spec — do NOT assume. Flip this only on your say-so.
const INCLUDE_REFERRAL = false

function clientOwnWhere(): Prisma.ContactWhereInput {
  const or: Prisma.ContactWhereInput[] = [
    { source: null }, // admin-curated hand lists
    { source: { endsWith: '_import' } }, // jobber_import, excel_import, servicetitan_import, ...
    { source: { in: INCLUDE_REFERRAL ? [...MANUAL_SOURCES, 'referral'] : MANUAL_SOURCES } },
  ]
  return { OR: or }
}

async function main() {
  const where = clientOwnWhere()

  const toTrue = await prisma.contact.count({ where })
  const alreadyTrue = await prisma.contact.count({ where: { ...where, isClientContact: true } })
  const willChange = await prisma.contact.count({ where: { ...where, isClientContact: false } })
  const total = await prisma.contact.count()

  console.log('\nBackfill plan for Contact.isClientContact')
  console.log(`  Total contacts:                 ${total}`)
  console.log(`  Match client-own rule (→ true): ${toTrue}`)
  console.log(`    of which already true:        ${alreadyTrue}`)
  console.log(`    of which WILL be updated:     ${willChange}`)
  console.log(`  Remaining (stay false):         ${total - toTrue}`)
  console.log(`  INCLUDE_REFERRAL:               ${INCLUDE_REFERRAL}`)

  if (!APPLY) {
    console.log('\nDRY RUN — no rows written. Re-run with --apply to commit.\n')
    return
  }

  const res = await prisma.contact.updateMany({
    where: { ...where, isClientContact: false },
    data: { isClientContact: true },
  })
  console.log(`\nAPPLIED — updated ${res.count} rows to isClientContact = true.\n`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
