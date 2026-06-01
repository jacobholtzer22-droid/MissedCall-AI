/**
 * Shared nav services config.
 * Desktop: ServicesDropdown renders all 5 with icon + description.
 * Mobile: NavMenu renders a flat list (no accordion) — just label + href.
 */
import type { LucideIcon } from 'lucide-react'
import { PhoneMissed, Globe, BarChart3, Megaphone, ShieldBan } from 'lucide-react'

export type NavService = {
  label: string
  href: string
  icon: LucideIcon
  description: string
}

export const NAV_SERVICES: NavService[] = [
  { label: 'MissedCall AI',     href: '/missedcall-ai',  icon: PhoneMissed, description: '24/7 AI texts back instantly'       },
  { label: 'Custom Websites',   href: '/websites',       icon: Globe,       description: 'Real code, not templates'          },
  { label: 'Google Ads',        href: '/ads-management', icon: BarChart3,   description: 'We run it, you get the leads'      },
  { label: 'Mass Campaigns',    href: '/campaigns',      icon: Megaphone,   description: 'One message, every customer'       },
  { label: 'Spam Screening',    href: '/spam-screening', icon: ShieldBan,   description: 'Only real callers get through'     },
]
