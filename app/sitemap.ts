import type { MetadataRoute } from 'next'

const BASE_URL = 'https://www.alignandacquire.com'

// Static public marketing routes only. Tenant /book/[slug] pages, /demo-requested,
// and dashboard/admin/api/auth/onboarding routes are intentionally excluded.
const PUBLIC_ROUTES = [
  '/',
  '/pricing',
  '/services',
  '/missedcall-ai',
  '/spam-screening',
  '/websites',
  '/ads-management',
  '/campaigns',
  '/reviews',
  '/about',
  '/book',
  '/privacy',
  '/terms',
]

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: route === '/' ? BASE_URL : `${BASE_URL}${route}`,
  }))
}
