import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: 'viewer' | 'reporter' | 'admin';
      permissions: string[];
    };
    accessToken: string;
    refreshToken: string;
    error?: string;
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: 'viewer' | 'reporter' | 'admin';
    permissions: string[];
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    email: string;
    role: 'viewer' | 'reporter' | 'admin';
    permissions: string[];
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    error?: string;
  }
}