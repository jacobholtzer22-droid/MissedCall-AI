import type { MetadataRoute } from 'next'

// /demo-requested is deliberately NOT disallowed here: it carries a meta noindex,
// and robots-blocking it would prevent crawlers from ever reading that directive.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/api', '/onboarding', '/sign-in', '/sign-up'],
    },
    sitemap: 'https://www.alignandacquire.com/sitemap.xml',
  }
}
