import { PrismaClient, User, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export interface UserCreateData {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  is_active?: boolean;
}

export interface UserUpdateData {
  username?: string;
  email?: string;
  role?: UserRole;
  is_active?: boolean;
}

export interface UserAuthData {
  id: string;
  username: string;
  email: string;
  role: UserRole;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export class UserModel {
  private static readonly SALT_ROUNDS = 12;

  static async findAll(activeOnly: boolean = true): Promise<User[]> {
    return prisma.user.findMany({
      where: activeOnly ? { is_active: true } : undefined,
      orderBy: {
        username: 'asc',
      },
    });
  }

  static async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  static async findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  static async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  static async create(data: UserCreateData): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.password, this.SALT_ROUNDS);
    
    return prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password_hash: hashedPassword,
        role: data.role,
        is_active: data.is_active ?? true,
      },
    });
  }

  static async update(id: string, data: UserUpdateData): Promise<User> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  static async updatePassword(id: string, newPassword: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    
    return prisma.user.update({
      where: { id },
      data: {
        password_hash: hashedPassword,
      },
    });
  }

  static async delete(id: string): Promise<User> {
    return prisma.user.delete({
      where: { id },
    });
  }

  static async deactivate(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        is_active: false,
      },
    });
  }

  static async activate(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        is_active: true,
      },
    });
  }

  static async verifyPassword(hashedPassword: string, plainPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      return false;
    }
  }

  static async authenticate(credentials: LoginCredentials): Promise<UserAuthData | null> {
    const user = await this.findByUsername(credentials.username);
    
    if (!user || !user.is_active) {
      return null;
    }
    
    const isPasswordValid = await this.verifyPassword(user.password_hash, credentials.password);
    
    if (!isPasswordValid) {
      return null;
    }
    
    // Update last login timestamp
    await this.updateLastLogin(user.id);
    
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }

  static async updateLastLogin(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        last_login_at: new Date(),
      },
    });
  }

  static async exists(username: string, email: string): Promise<{ username: boolean; email: boolean }> {
    const [userByUsername, userByEmail] = await Promise.all([
      this.findByUsername(username),
      this.findByEmail(email),
    ]);
    
    return {
      username: !!userByUsername,
      email: !!userByEmail,
    };
  }

  static async getUserByRole(role: UserRole): Promise<User[]> {
    return prisma.user.findMany({
      where: {
        role,
        is_active: true,
      },
      orderBy: {
        username: 'asc',
      },
    });
  }

  static async getRolePermissions(role: UserRole): Promise<string[]> {
    const permissions: Record<UserRole, string[]> = {
      viewer: [
        'read_system_status',
        'read_services',
        'read_uptime',
        'read_incidents',
        'read_sla',
      ],
      reporter: [
        'read_system_status',
        'read_services',
        'read_uptime',
        'read_incidents',
        'read_sla',
        'report_incidents',
        'update_own_incidents',
        'comment_incidents',
      ],
      admin: [
        'read_system_status',
        'read_services',
        'read_uptime',
        'read_incidents',
        'read_sla',
        'report_incidents',
        'update_own_incidents',
        'comment_incidents',
        'manage_incidents',
        'manage_services',
        'manage_users',
        'manage_system',
        'delete_incidents',
        'view_sensitive_data',
      ],
    };

    return permissions[role] || [];
  }

  static async getPermissions(userId: string): Promise<string[]> {
    const user = await this.findById(userId);

    if (!user || !user.is_active) {
      return [];
    }

    return this.getRolePermissions(user.role);
  }

  static async hasPermission(userId: string, permission: string): Promise<boolean> {
    const user = await this.findById(userId);
    
    if (!user || !user.is_active) {
      return false;
    }
    
    const permissions = await this.getRolePermissions(user.role);
    return permissions.includes(permission);
  }

  static async canAccessIncidents(userId: string): Promise<boolean> {
    return this.hasPermission(userId, 'read_incidents');
  }

  static async canCreateIncidents(userId: string): Promise<boolean> {
    return this.hasPermission(userId, 'report_incidents');
  }

  static async canUpdateIncidents(userId: string): Promise<boolean> {
    return this.hasPermission(userId, 'update_own_incidents');
  }

  static async canDeleteIncidents(userId: string): Promise<boolean> {
    return this.hasPermission(userId, 'delete_incidents');
  }

  static async canManageUsers(userId: string): Promise<boolean> {
    return this.hasPermission(userId, 'manage_users');
  }

  static async getActiveUserStats(): Promise<{
    total: number;
    byRole: Record<UserRole, number>;
  }> {
    const users = await prisma.user.findMany({
      where: { is_active: true },
      select: { role: true },
    });
    
    const byRole = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {} as Record<UserRole, number>);
    
    return {
      total: users.length,
      byRole,
    };
  }

  static toAuthData(user: User): UserAuthData {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }

  static async setPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    // TODO: Implement password reset token storage
    console.log(`Password reset token set for user ${userId}`);
  }

  static async verifyPasswordResetToken(email: string, token: string): Promise<User | null> {
    // TODO: Implement password reset token verification
    console.log(`Verifying password reset token for ${email}`);
    return await this.findByEmail(email);
  }

  static async clearPasswordResetToken(userId: string): Promise<void> {
    // TODO: Implement password reset token clearing
    console.log(`Password reset token cleared for user ${userId}`);
  }

  static toPublicData(user: User): Omit<User, 'password_hash'> {
    const { password_hash, ...publicData } = user;
    return publicData;
  }
}

export default UserModel;