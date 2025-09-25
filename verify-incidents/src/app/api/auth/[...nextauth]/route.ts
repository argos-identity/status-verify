import NextAuth from 'next-auth'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:3001/api'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          // Call backend API for authentication
          const response = await fetch(`${BACKEND_API_URL}/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })

          if (!response.ok) {
            console.error('Login failed:', response.status, response.statusText)
            return null
          }

          const data = await response.json()

          if (data.success && data.data) {
            return {
              id: data.data.user.id,
              name: data.data.user.name,
              email: data.data.user.email,
              role: data.data.user.role,
              permissions: data.data.user.permissions,
              accessToken: data.data.tokens.accessToken,
              refreshToken: data.data.tokens.refreshToken,
              expiresIn: data.data.tokens.expiresIn,
            }
          }
        } catch (error) {
          console.error('Authentication error:', error)
        }

        return null
      }
    })
  ],
  pages: {
    signIn: '/auth/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user && account) {
        token.userId = user.id
        token.email = user.email!
        token.role = user.role
        token.permissions = user.permissions
        token.accessToken = user.accessToken
        token.refreshToken = user.refreshToken
        token.expiresAt = Date.now() + user.expiresIn * 1000
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < token.expiresAt) {
        return token
      }

      // Access token has expired, try to refresh it
      try {
        const response = await fetch(`${BACKEND_API_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refreshToken: token.refreshToken,
          }),
        })

        if (!response.ok) {
          console.error('Token refresh failed:', response.status)
          throw new Error('Token refresh failed')
        }

        const data = await response.json()

        if (data.success && data.data) {
          return {
            ...token,
            accessToken: data.data.tokens.accessToken,
            refreshToken: data.data.tokens.refreshToken,
            expiresAt: Date.now() + data.data.tokens.expiresIn * 1000,
          }
        }
      } catch (error) {
        console.error('Token refresh error:', error)
        return {
          ...token,
          error: 'RefreshAccessTokenError',
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId
        session.user.email = token.email
        session.user.role = token.role
        session.user.permissions = token.permissions
        session.accessToken = token.accessToken
        session.refreshToken = token.refreshToken
        session.error = token.error
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }