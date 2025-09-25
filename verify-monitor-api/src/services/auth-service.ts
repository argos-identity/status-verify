import UserModel from '../models/user';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  permissions: string[];
}

export interface AuthResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    permissions: string[];
  };
  token: string;
  expiresIn: number;
}

export interface PasswordResetData {
  email: string;
  resetToken: string;
  newPassword: string;
}

export class AuthService {
  private readonly JWT_SECRET: string;
  private readonly JWT_EXPIRES_IN: string = '24h';
  private readonly SALT_ROUNDS: number = 12;

  constructor() {
    this.JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    if (!process.env.JWT_SECRET) {
      console.warn('JWT_SECRET not set in environment variables. Using default value.');
    }
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      // Validate input
      const validation = this.validateLoginCredentials(credentials);
      if (!validation.isValid) {
        throw new Error(`Invalid credentials: ${validation.errors.join(', ')}`);
      }

      // Find user by email
      const user = await UserModel.findByEmail(credentials.email);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(credentials.password, user.password_hash);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Check if user is active
      if (!user.is_active) {
        throw new Error('Account is deactivated. Please contact administrator.');
      }

      // Update last login
      await UserModel.updateLastLogin(user.id);

      // Get user permissions
      const permissions = await UserModel.getPermissions(user.id);

      // Generate JWT token
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions,
      };

      const token = jwt.sign(tokenPayload, this.JWT_SECRET, {
        expiresIn: this.JWT_EXPIRES_IN,
      });

      // Calculate expiration time in seconds
      const expiresIn = 24 * 60 * 60; // 24 hours in seconds

      return {
        user: {
          id: user.id,
          name: user.username,
          email: user.email,
          role: user.role,
          permissions,
        },
        token,
        expiresIn,
      };
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Authentication failed');
    }
  }

  async register(userData: RegisterData): Promise<AuthResponse> {
    try {
      // Validate input
      const validation = this.validateRegisterData(userData);
      if (!validation.isValid) {
        throw new Error(`Registration failed: ${validation.errors.join(', ')}`);
      }

      // Check if email is already taken
      const existingUser = await UserModel.findByEmail(userData.email);
      if (existingUser) {
        throw new Error('Email is already registered');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(userData.password, this.SALT_ROUNDS);

      // Create user (default role is 'viewer' if not specified)
      const user = await UserModel.create({
        name: userData.name,
        email: userData.email,
        password_hash: passwordHash,
        role: userData.role || 'viewer',
      });

      // Get user permissions
      const permissions = await UserModel.getPermissions(user.id);

      // Generate JWT token
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions,
      };

      const token = jwt.sign(tokenPayload, this.JWT_SECRET, {
        expiresIn: this.JWT_EXPIRES_IN,
      });

      const expiresIn = 24 * 60 * 60; // 24 hours in seconds

      return {
        user: {
          id: user.id,
          name: user.username,
          email: user.email,
          role: user.role,
          permissions,
        },
        token,
        expiresIn,
      };
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Registration failed');
    }
  }

  async verifyToken(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
      
      // Verify user still exists and is active
      const user = await UserModel.findById(decoded.userId);
      if (!user || !user.is_active) {
        throw new Error('User not found or deactivated');
      }

      // Return the decoded payload
      return decoded;
    } catch (error: any) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      throw new Error(error.message || 'Token verification failed');
    }
  }

  async refreshToken(currentToken: string): Promise<AuthResponse> {
    try {
      // Verify the current token (ignoring expiration for refresh)
      let decoded: TokenPayload;
      try {
        decoded = jwt.verify(currentToken, this.JWT_SECRET, { ignoreExpiration: true }) as TokenPayload;
      } catch (error) {
        throw new Error('Invalid token for refresh');
      }

      // Get fresh user data
      const user = await UserModel.findById(decoded.userId);
      if (!user || !user.is_active) {
        throw new Error('User not found or deactivated');
      }

      // Get current permissions (in case they changed)
      const permissions = await UserModel.getPermissions(user.id);

      // Generate new token
      const newTokenPayload: TokenPayload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions,
      };

      const newToken = jwt.sign(newTokenPayload, this.JWT_SECRET, {
        expiresIn: this.JWT_EXPIRES_IN,
      });

      const expiresIn = 24 * 60 * 60; // 24 hours in seconds

      return {
        user: {
          id: user.id,
          name: user.username,
          email: user.email,
          role: user.role,
          permissions,
        },
        token: newToken,
        expiresIn,
      };
    } catch (error: any) {
      console.error('Token refresh error:', error);
      throw new Error(error.message || 'Token refresh failed');
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    try {
      // Validate new password
      const validation = this.validatePassword(newPassword);
      if (!validation.isValid) {
        throw new Error(`Invalid password: ${validation.errors.join(', ')}`);
      }

      // Get user
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);

      // Update password
      await UserModel.updatePassword(userId, newPasswordHash);
    } catch (error: any) {
      console.error('Change password error:', error);
      throw new Error(error.message || 'Password change failed');
    }
  }

  async requestPasswordReset(email: string): Promise<{ resetToken: string; expiresAt: Date }> {
    try {
      // Validate email format
      if (!this.isValidEmail(email)) {
        throw new Error('Invalid email format');
      }

      // Find user
      const user = await UserModel.findByEmail(email);
      if (!user) {
        // For security, don't reveal if email exists
        throw new Error('If the email exists, a password reset link has been sent');
      }

      // Generate reset token (expires in 1 hour)
      const resetToken = this.generateResetToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Store reset token (would typically be stored in database)
      await UserModel.setPasswordResetToken(user.id, resetToken, expiresAt);

      return { resetToken, expiresAt };
    } catch (error: any) {
      console.error('Password reset request error:', error);
      throw new Error(error.message || 'Password reset request failed');
    }
  }

  async resetPassword(resetData: PasswordResetData): Promise<void> {
    try {
      // Validate new password
      const validation = this.validatePassword(resetData.newPassword);
      if (!validation.isValid) {
        throw new Error(`Invalid password: ${validation.errors.join(', ')}`);
      }

      // Find user by email
      const user = await UserModel.findByEmail(resetData.email);
      if (!user) {
        throw new Error('Invalid reset token');
      }

      // Verify reset token
      const isValidToken = await UserModel.verifyPasswordResetToken(user.id, resetData.resetToken);
      if (!isValidToken) {
        throw new Error('Invalid or expired reset token');
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(resetData.newPassword, this.SALT_ROUNDS);

      // Update password and clear reset token
      await UserModel.updatePassword(user.id, newPasswordHash);
      await UserModel.clearPasswordResetToken(user.id);
    } catch (error: any) {
      console.error('Password reset error:', error);
      throw new Error(error.message || 'Password reset failed');
    }
  }

  async getUserProfile(userId: string): Promise<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
    permissions: string[];
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
  }> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const permissions = await UserModel.getPermissions(userId);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions,
        isActive: user.is_active,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      };
    } catch (error: any) {
      console.error('Get user profile error:', error);
      throw new Error(error.message || 'Failed to get user profile');
    }
  }

  async updateUserProfile(
    userId: string,
    updates: { name?: string; email?: string }
  ): Promise<User> {
    try {
      // Validate updates
      if (updates.name !== undefined) {
        if (!updates.name || updates.name.trim().length === 0) {
          throw new Error('Name cannot be empty');
        }
        if (updates.name.length > 100) {
          throw new Error('Name must be 100 characters or less');
        }
      }

      if (updates.email !== undefined) {
        if (!this.isValidEmail(updates.email)) {
          throw new Error('Invalid email format');
        }
        
        // Check if email is already taken by another user
        const existingUser = await UserModel.findByEmail(updates.email);
        if (existingUser && existingUser.id !== userId) {
          throw new Error('Email is already in use by another account');
        }
      }

      // Update user
      return await UserModel.update(userId, updates);
    } catch (error: any) {
      console.error('Update user profile error:', error);
      throw new Error(error.message || 'Failed to update user profile');
    }
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    try {
      return await UserModel.hasPermission(userId, permission);
    } catch (error) {
      console.error('Permission check error:', error);
      return false; // Default to no permission on error
    }
  }

  async checkRoleAccess(userId: string, requiredRole: UserRole): Promise<boolean> {
    try {
      const user = await UserModel.findById(userId);
      if (!user || !user.is_active) {
        return false;
      }

      // Role hierarchy: admin > reporter > viewer
      const roleHierarchy: Record<UserRole, number> = {
        admin: 3,
        reporter: 2,
        viewer: 1,
      };

      return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
    } catch (error) {
      console.error('Role access check error:', error);
      return false;
    }
  }

  // Validation helpers
  private validateLoginCredentials(credentials: LoginCredentials): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!credentials.email || !this.isValidEmail(credentials.email)) {
      errors.push('Valid email is required');
    }

    if (!credentials.password || credentials.password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private validateRegisterData(data: RegisterData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!data.name || data.name.trim().length === 0) {
      errors.push('Name is required');
    } else if (data.name.length > 100) {
      errors.push('Name must be 100 characters or less');
    }

    if (!data.email || !this.isValidEmail(data.email)) {
      errors.push('Valid email is required');
    }

    const passwordValidation = this.validatePassword(data.password);
    if (!passwordValidation.isValid) {
      errors.push(...passwordValidation.errors);
    }

    if (data.role && !['viewer', 'reporter', 'admin'].includes(data.role)) {
      errors.push('Invalid role specified');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private validatePassword(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!password) {
      errors.push('Password is required');
      return { isValid: false, errors };
    }

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 100) {
      errors.push('Password must be 100 characters or less');
    }

    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private generateResetToken(): string {
    // Generate a secure random token
    return require('crypto').randomBytes(32).toString('hex');
  }
}

export default new AuthService();