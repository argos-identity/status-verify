/**
 * Express Type Augmentation
 *
 * This file extends the Express Request interface to include custom properties
 * that are added by our middleware (auth, logging, etc.)
 *
 * By augmenting the Express namespace, TypeScript will recognize these properties
 * throughout the application without needing a custom AuthRequest interface.
 */

import { UserRole } from '@prisma/client';

declare module 'express-serve-static-core' {
  interface Request {
    /**
     * Authenticated user information (set by auth middleware)
     */
    user?: {
      userId: string;
      id?: string;          // Alias for userId (compatibility)
      email: string;
      username?: string;    // Username field (optional)
      name?: string;        // Display name (optional)
      role: 'viewer' | 'reporter' | 'admin';
      permissions: string[];
    };

    /**
     * ISO timestamp when the request was received (set by logging middleware)
     */
    requestTime?: string;

    /**
     * Unique request identifier for tracing (set by logging middleware)
     */
    requestId?: string;
  }
}
