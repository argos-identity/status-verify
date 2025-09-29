import { withAuth } from 'next-auth/middleware'
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

export default withAuth(
  function middleware(req) {
    // Run the intl middleware for internationalization
    return intlMiddleware(req);
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Extract pathname without locale prefix for authorization check
        const pathname = req.nextUrl.pathname;
        const pathnameWithoutLocale = pathname.replace(/^\/(ko|en)/, '') || '/';

        // Protect /incidents/create route (with or without locale prefix)
        if (pathnameWithoutLocale.startsWith('/incidents/create')) {
          return !!token
        }
        // Protect /incidents/[id]/edit routes (with or without locale prefix)
        if (pathnameWithoutLocale.match(/^\/incidents\/[^\/]+\/edit/)) {
          return !!token
        }
        return true
      },
    },
  }
)

export const config = {
  // Match only internationalized pathnames and protected routes
  matcher: ['/', '/(ko|en)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)']
}