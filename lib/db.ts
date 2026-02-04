// ===========================================
// DATABASE CLIENT
// ===========================================
// This creates a single database connection that's reused
// across your entire application (important for serverless)

import { PrismaClient } from '@prisma/client'

// Declare global type for the prisma client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create the client (reuse existing in development to avoid too many connections)
export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// In development, save to global to reuse across hot reloads
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
