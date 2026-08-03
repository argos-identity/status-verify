import { PrismaClient } from '@prisma/client';
import { resetDatabaseData, reseedEssentialData } from '../utils/reset-data';

interface ResetDataOptions {
  preserveUsers?: boolean;
  reseedServices?: boolean;
  confirmationToken?: string;
}

interface ResetDataResult {
  success: boolean;
  message: string;
  deletedCounts: {
    incidentUpdates: number;
    incidents: number;
    services: number;
    users?: number;
  };
  timestamp: Date;
}

interface BackupDataResult {
  success: boolean;
  backupId: string;
  filePath?: string;
  size?: number;
  timestamp: Date;
}

class AdminService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Reset database data with safety checks and logging
   */
  async resetData(options: ResetDataOptions = {}): Promise<ResetDataResult> {
    const {
      preserveUsers = true,
      reseedServices = true,
      confirmationToken,
    } = options;

    // Validate confirmation token for production safety
    if (process.env.NODE_ENV === 'production') {
      if (!confirmationToken || confirmationToken !== process.env.ADMIN_RESET_TOKEN) {
        throw new Error('Invalid confirmation token for production reset');
      }
    }

    const startTime = new Date();
    console.log(`🔄 Admin reset initiated at ${startTime.toISOString()}`);

    try {
      const deletedCounts = {
        incidentUpdates: 0,
        incidents: 0,
        services: 0,
        users: 0,
      };

      // Use transaction for data consistency
      await this.prisma.$transaction(async (tx) => {
        // Delete in order to respect foreign key constraints
        const incidentUpdatesResult = await tx.incidentUpdate.deleteMany({});
        deletedCounts.incidentUpdates = incidentUpdatesResult.count;

        const incidentsResult = await tx.incident.deleteMany({});
        deletedCounts.incidents = incidentsResult.count;

        const servicesResult = await tx.service.deleteMany({});
        deletedCounts.services = servicesResult.count;

        if (!preserveUsers) {
          const usersResult = await tx.user.deleteMany({});
          deletedCounts.users = usersResult.count;
        }
      });

      // Re-seed services if requested
      if (reseedServices) {
        await reseedEssentialData();
      }

      const result: ResetDataResult = {
        success: true,
        message: preserveUsers
          ? 'Database data reset completed successfully (users preserved)'
          : 'Database fully reset completed successfully',
        deletedCounts,
        timestamp: new Date(),
      };

      console.log(`✅ Admin reset completed successfully in ${Date.now() - startTime.getTime()}ms`);
      return result;

    } catch (error) {
      console.error('❌ Admin reset failed:', error);
      throw new Error(`Database reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get database statistics before reset
   */
  async getDatabaseStats(): Promise<{
    totalRecords: number;
    tables: Record<string, number>;
  }> {
    try {
      const [
        incidentUpdatesCount,
        incidentsCount,
        servicesCount,
        usersCount,
      ] = await Promise.all([
        this.prisma.incidentUpdate.count(),
        this.prisma.incident.count(),
        this.prisma.service.count(),
        this.prisma.user.count(),
      ]);

      const tables = {
        incident_updates: incidentUpdatesCount,
        incidents: incidentsCount,
        services: servicesCount,
        users: usersCount,
      };

      const totalRecords = Object.values(tables).reduce((sum, count) => sum + count, 0);

      return {
        totalRecords,
        tables,
      };
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      throw new Error(`Failed to get database statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a unique reset confirmation token
   */
  generateResetToken(): string {
    return `reset_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Validate environment for reset operations
   */
  validateResetEnvironment(): {
    canReset: boolean;
    warnings: string[];
    requirements: string[];
  } {
    const warnings: string[] = [];
    const requirements: string[] = [];
    let canReset = true;

    // Check environment
    if (process.env.NODE_ENV === 'production') {
      warnings.push('Running in production environment');
      if (!process.env.ADMIN_RESET_TOKEN) {
        requirements.push('ADMIN_RESET_TOKEN environment variable must be set');
        canReset = false;
      }
      if (!process.env.ALLOW_PRODUCTION_RESET) {
        requirements.push('ALLOW_PRODUCTION_RESET environment variable must be set to true');
        canReset = false;
      }
    }

    // Check database connection
    // Note: This would require actual connection testing

    return {
      canReset,
      warnings,
      requirements,
    };
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default AdminService;