import { PrismaClient, Incident, IncidentStatus, IncidentSeverity, IncidentPriority } from '@prisma/client';

const prisma = new PrismaClient();

export interface IncidentWithUpdates extends Incident {
  updates?: any[]; // Will be populated with IncidentUpdate[]
}

export interface IncidentCreateData {
  title: string;
  description?: string;
  severity: IncidentSeverity;
  priority?: IncidentPriority;
  affected_services: string[];
  reporter?: string;
  reporter_id?: string;
  detection_criteria?: string;
  status?: IncidentStatus;
}

export interface IncidentUpdateData {
  title?: string;
  description?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  priority?: IncidentPriority;
  resolved_at?: Date;
}

export interface IncidentFilters {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  severity?: IncidentSeverity;
  limit?: number;
  offset?: number;
}

export class IncidentModel {
  private static generateIncidentId(): string {
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    return `inc-${year}-${timestamp}`;
  }

  static async findAll(filters: IncidentFilters = {}): Promise<{ incidents: Incident[]; total: number }> {
    const { status, priority, severity, limit = 10, offset = 0 } = filters;
    
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (severity) where.severity = severity;
    
    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        skip: offset,
        take: limit,
      }),
      prisma.incident.count({ where }),
    ]);
    
    return { incidents, total };
  }

  static async findById(id: string): Promise<IncidentWithUpdates | null> {
    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        updates: {
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
        },
      },
    });

    return incident;
  }

  static async findByIdWithDetails(id: string): Promise<IncidentWithUpdates | null> {
    const incident = await prisma.incident.findUnique({
      where: { id },
      include: {
        updates: {
          orderBy: {
            created_at: 'asc',
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return incident;
  }

  static async findManyWithDetails(
    limit: number = 50,
    offset: number = 0,
    status?: string
  ): Promise<{ incidents: IncidentWithUpdates[]; total: number }> {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        skip: offset,
        take: limit,
        include: {
          updates: {
            orderBy: {
              created_at: 'asc',
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      prisma.incident.count({ where }),
    ]);

    return { incidents, total };
  }

  static async create(data: IncidentCreateData): Promise<Incident> {
    const id = this.generateIncidentId();

    // Debug logging
    console.log('Incident.create called with data:', {
      severity: data.severity,
      priority: data.priority,
      full_data: data
    });

    return prisma.incident.create({
      data: {
        id,
        title: data.title,
        description: data.description,
        status: data.status || 'investigating', // Default initial status
        severity: data.severity,
        priority: data.priority || 'P3', // Default priority (P3 = Medium)
        affected_services: data.affected_services,
        reporter: data.reporter || data.reporter_id,
        detection_criteria: data.detection_criteria || null,
      },
    });
  }

  static async update(id: string, data: IncidentUpdateData): Promise<Incident> {
    const updateData: any = { ...data };
    
    // Auto-set resolved_at when status changes to resolved
    if (data.status === 'resolved' && !data.resolved_at) {
      updateData.resolved_at = new Date();
    }
    
    return prisma.incident.update({
      where: { id },
      data: updateData,
    });
  }

  static async delete(id: string): Promise<Incident> {
    return prisma.incident.delete({
      where: { id },
    });
  }

  static async exists(id: string): Promise<boolean> {
    const incident = await prisma.incident.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!incident;
  }

  static async getPastIncidents(days: number = 30, page: number = 1, limit: number = 10): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const incidents = await prisma.incident.findMany({
      where: {
        created_at: {
          gte: startDate,
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      skip: (page - 1) * limit,
      take: limit,
    });
    
    const total = await prisma.incident.count({
      where: {
        created_at: {
          gte: startDate,
        },
      },
    });
    
    // Group incidents by date
    const incidentsByDate = new Map<string, any[]>();
    const daysArray: any[] = [];
    
    // Create array of days for the requested period
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      
      const dayIncidents = incidents.filter(incident => {
        const incidentDate = incident.created_at.toISOString().split('T')[0];
        return incidentDate === dateKey;
      });
      
      daysArray.push({
        date: dateKey,
        incidents: dayIncidents.length > 0 ? dayIncidents.map(incident => ({
          id: incident.id,
          title: incident.title,
          status: incident.status,
        })) : null,
        noIncidentMessage: dayIncidents.length === 0 ? '특별한 문제가 없습니다.' : undefined,
      });
    }
    
    return {
      days: daysArray,
      pagination: {
        page,
        limit,
        total: Math.ceil(total / limit),
      },
    };
  }

  static validateStatusTransition(currentStatus: IncidentStatus, newStatus: IncidentStatus): boolean {
    const validTransitions: Record<IncidentStatus, IncidentStatus[]> = {
      investigating: ['identified', 'resolved'],
      identified: ['monitoring', 'resolved'],
      monitoring: ['resolved', 'identified'], // Can go back if issue reoccurs
      resolved: [], // Cannot change from resolved
    };

    return validTransitions[currentStatus]?.includes(newStatus) || false;
  }

  static isValidStatusTransition(currentStatus: IncidentStatus, newStatus: IncidentStatus): boolean {
    return this.validateStatusTransition(currentStatus, newStatus);
  }

  static async getResolutionTime(incidentId: string): Promise<number | null> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: {
        created_at: true,
        resolved_at: true,
      },
    });
    
    if (!incident?.resolved_at) {
      return null;
    }
    
    return incident.resolved_at.getTime() - incident.created_at.getTime();
  }

  static async getAffectedServices(incidentId: string): Promise<string[]> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: {
        affected_services: true,
      },
    });

    return incident?.affected_services || [];
  }

  static async findByService(
    serviceId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ incidents: IncidentWithUpdates[]; total: number }> {
    const where = {
      affected_services: {
        has: serviceId,
      },
    };

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        orderBy: {
          created_at: 'desc',
        },
        skip: offset,
        take: limit,
        include: {
          updates: {
            orderBy: {
              created_at: 'asc',
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      prisma.incident.count({ where }),
    ]);

    return { incidents, total };
  }

  static async getMetrics(days: number = 30): Promise<{
    totalIncidents: number;
    incidentsBySeverity: Record<IncidentSeverity, number>;
    incidentsByStatus: Record<IncidentStatus, number>;
    avgResolutionTime: number; // in hours
    mttr: number; // Mean Time To Resolution in hours
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const incidents = await prisma.incident.findMany({
      where: {
        created_at: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        status: true,
        severity: true,
        created_at: true,
        resolved_at: true,
      },
    });

    const totalIncidents = incidents.length;

    // Initialize counts
    const incidentsBySeverity: Record<IncidentSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    const incidentsByStatus: Record<IncidentStatus, number> = {
      investigating: 0,
      identified: 0,
      monitoring: 0,
      resolved: 0,
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    incidents.forEach(incident => {
      incidentsBySeverity[incident.severity]++;
      incidentsByStatus[incident.status]++;

      if (incident.resolved_at && incident.status === 'resolved') {
        const resolutionTimeMs = incident.resolved_at.getTime() - incident.created_at.getTime();
        totalResolutionTime += resolutionTimeMs;
        resolvedCount++;
      }
    });

    const avgResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount / (1000 * 60 * 60) : 0; // Convert to hours
    const mttr = avgResolutionTime; // For simplicity, MTTR = average resolution time

    return {
      totalIncidents,
      incidentsBySeverity,
      incidentsByStatus,
      avgResolutionTime,
      mttr,
    };
  }

  static async findIncidentsByServiceAndDateRange(
    serviceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Incident[]> {
    const incidents = await prisma.incident.findMany({
      where: {
        affected_services: {
          has: serviceId,
        },
        OR: [
          {
            // Incident created during the range
            created_at: {
              gte: startDate,
              lte: endDate,
            },
          },
          {
            // Incident created before the range but still active during it
            AND: [
              {
                created_at: {
                  lt: endDate,
                },
              },
              {
                OR: [
                  {
                    resolved_at: null, // Not yet resolved
                  },
                  {
                    resolved_at: {
                      gte: startDate, // Resolved during or after the range
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    return incidents;
  }
}

export default IncidentModel;