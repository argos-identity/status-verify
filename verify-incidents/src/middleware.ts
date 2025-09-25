import { withAuth } from 'next-auth/middleware'

export default withAuth(
  function middleware(req) {
    // Add any additional middleware logic here if needed
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Protect /incidents/create route
        if (req.nextUrl.pathname.startsWith('/incidents/create')) {
          return !!token
        }
        // Protect /incidents/[id]/edit routes
        if (req.nextUrl.pathname.match(/^\/incidents\/[^\/]+\/edit/)) {
          return !!token
        }
        return true
      },
    },
  }
)

export const config = {
  matcher: ['/incidents/create', '/incidents/:path*/edit']
}