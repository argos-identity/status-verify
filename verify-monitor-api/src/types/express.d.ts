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

declare global {
  namespace Express {
    export interface Request {
      /**
       * Authenticated user information (set by auth middleware)
       */
      user?: {
        userId: string;
        email: string;
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
}

// This export statement is necessary for TypeScript to treat this file as a module
export {};
