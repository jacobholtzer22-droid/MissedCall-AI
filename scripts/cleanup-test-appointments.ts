/**
 * One-time cleanup: Delete appointments with scheduledAt in the past AND status "cancelled".
 * These are typically test artifacts cluttering the dashboard.
 *
 * Run: npx tsx scripts/cleanup-test-appointments.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const now = new Date()
  const deleted = await prisma.appointment.deleteMany({
    where: {
      scheduledAt: { lt: now },
      status: 'cancelled',
    },
  })
  console.log(`Deleted ${deleted.count} past cancelled appointments (test artifacts)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
