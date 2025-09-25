import { PrismaClient, IncidentUpdate, IncidentStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface IncidentUpdateCreateData {
  incident_id: string;
  status?: IncidentStatus;
  description: string;
  user_id?: string;
}

export interface IncidentUpdateWithUser extends IncidentUpdate {
  user?: {
    id: string;
    username: string;
  } | null;
}

export class IncidentUpdateModel {
  static async create(data: IncidentUpdateCreateData): Promise<IncidentUpdateWithUser> {
    // Validate description exists and minimum length
    if (!data.description || data.description.length < 10) {
      throw new Error('Description must be provided and at least 10 characters long');
    }

    const update = await prisma.incidentUpdate.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // If this is a status change, update the incident's status
    if (data.status) {
      await prisma.incident.update({
        where: { id: data.incident_id },
        data: {
          status: data.status,
          resolved_at: data.status === 'resolved' ? new Date() : undefined,
        },
      });
    }

    return update;
  }

  static async findByIncident(incidentId: string): Promise<IncidentUpdateWithUser[]> {
    return prisma.incidentUpdate.findMany({
      where: {
        incident_id: incidentId,
      },
      orderBy: {
        created_at: 'asc',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  static async findById(id: number): Promise<IncidentUpdateWithUser | null> {
    return prisma.incidentUpdate.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  static async getLatestUpdate(incidentId: string): Promise<IncidentUpdateWithUser | null> {
    return prisma.incidentUpdate.findFirst({
      where: {
        incident_id: incidentId,
      },
      orderBy: {
        created_at: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  static async getUpdatesByUser(userId: string, limit: number = 50): Promise<IncidentUpdateWithUser[]> {
    return prisma.incidentUpdate.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        incident: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  static async getStatusChanges(incidentId: string): Promise<IncidentUpdateWithUser[]> {
    return prisma.incidentUpdate.findMany({
      where: {
        incident_id: incidentId,
        status: {
          not: null,
        },
      },
      orderBy: {
        created_at: 'asc',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  static async update(id: number, data: Partial<Omit<IncidentUpdate, 'id' | 'created_at' | 'incident_id'>>): Promise<IncidentUpdateWithUser> {
    return prisma.incidentUpdate.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  }

  static async delete(id: number): Promise<IncidentUpdate> {
    return prisma.incidentUpdate.delete({
      where: { id },
    });
  }

  static async getUpdateStats(incidentId: string): Promise<{
    totalUpdates: number;
    statusChanges: number;
    commentsOnly: number;
    contributors: number;
  }> {
    const [totalUpdates, statusChanges, uniqueUsers] = await Promise.all([
      prisma.incidentUpdate.count({
        where: { incident_id: incidentId },
      }),
      prisma.incidentUpdate.count({
        where: {
          incident_id: incidentId,
          status: { not: null },
        },
      }),
      prisma.incidentUpdate.findMany({
        where: { incident_id: incidentId },
        select: { user_id: true },
        distinct: ['user_id'],
      }),
    ]);

    return {
      totalUpdates,
      statusChanges,
      commentsOnly: totalUpdates - statusChanges,
      contributors: uniqueUsers.filter(u => u.user_id).length,
    };
  }

  static async createComment(incidentId: string, description: string, userId?: string): Promise<IncidentUpdateWithUser> {
    return this.create({
      incident_id: incidentId,
      description,
      user_id: userId,
    });
  }

  static async createStatusChange(
    incidentId: string, 
    newStatus: IncidentStatus, 
    description: string, 
    userId?: string
  ): Promise<IncidentUpdateWithUser> {
    return this.create({
      incident_id: incidentId,
      status: newStatus,
      description,
      user_id: userId,
    });
  }
}

export default IncidentUpdateModel;