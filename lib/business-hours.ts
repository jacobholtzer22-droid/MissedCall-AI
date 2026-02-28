// Client-safe business hours constants (no Node.js or googleapis dependencies)
// Used by admin UI and lib/google-calendar.ts

export const DEFAULT_BUSINESS_HOURS: Record<string, { open: string; close: string } | null> = {
  monday: { open: '09:00', close: '17:00' },
  tuesday: { open: '09:00', close: '17:00' },
  wednesday: { open: '09:00', close: '17:00' },
  thursday: { open: '09:00', close: '17:00' },
  friday: { open: '09:00', close: '17:00' },
  saturday: null,
  sunday: null,
}
