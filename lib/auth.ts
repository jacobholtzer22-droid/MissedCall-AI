// ===========================================
// AUTH UTILITIES
// ===========================================
// Helper functions to get current user and their business

import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from './db'

// Get the current user's business
export async function getCurrentBusiness() {
  const { userId } = await auth()
  
  if (!userId) {
    return null
  }

  // Find the user in our database
  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  return user?.business || null
}

// Get the current user from our database
export async function getCurrentUser() {
  const { userId } = await auth()
  
  if (!userId) {
    return null
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: { business: true }
  })

  return user
}

// Check if user needs onboarding (no business linked)
export async function needsOnboarding() {
  const { userId } = await auth()
  
  if (!userId) {
    return false
  }

  const user = await db.user.findUnique({
    where: { clerkId: userId }
  })

  // Needs onboarding if user doesn't exist in our DB or has no business
  return !user || !user.businessId
}