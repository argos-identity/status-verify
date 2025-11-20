import { PrismaClient, Service } from '@prisma/client';

const prisma = new PrismaClient();

export interface ServiceWithStats extends Service {
  currentStatus?: 'operational' | 'degraded' | 'outage';
  uptimePercentage?: string;
  uptimeData?: string[]; // 90-day status array
}

export class ServiceModel {
  static async findAll(): Promise<Service[]> {
    return prisma.service.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  static async findById(id: string): Promise<Service | null> {
    return prisma.service.findUnique({
      where: { id },
    });
  }

  static async findByIds(ids: string[]): Promise<Service[]> {
    return prisma.service.findMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
  }

  static async create(data: Omit<Service, 'created_at' | 'updated_at'>): Promise<Service> {
    return prisma.service.create({
      data,
    });
  }

  static async update(id: string, data: Partial<Omit<Service, 'id' | 'created_at' | 'updated_at'>>): Promise<Service> {
    return prisma.service.update({
      where: { id },
      data,
    });
  }

  static async delete(id: string): Promise<Service> {
    return prisma.service.delete({
      where: { id },
    });
  }

  static async exists(id: string): Promise<boolean> {
    const service = await prisma.service.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!service;
  }

  static async existsAll(ids: string[]): Promise<boolean> {
    const count = await prisma.service.count({
      where: {
        id: {
          in: ids,
        },
      },
    });
    return count === ids.length;
  }

  static async getWithUptimeStats(serviceIds?: string[]): Promise<ServiceWithStats[]> {
    const where = serviceIds ? { id: { in: serviceIds } } : {};

    console.log('🔍 getWithUptimeStats called with serviceIds:', serviceIds);

    const services = await prisma.service.findMany({
      where,
      include: {
        uptime_records: {
          orderBy: {
            date: 'desc',
          },
          take: 90, // Last 90 days
        },
      },
    });

    console.log('📊 Found services:', services.length);
    console.log('📋 Services with uptime records:', services.map(s => ({
      id: s.id,
      name: s.name,
      uptimeRecordsCount: s.uptime_records.length
    })));

    return services.map(service => {
      const uptimeRecords = service.uptime_records;
      
      // Generate 90-day status array
      const uptimeData: string[] = [];
      const today = new Date();
      
      for (let i = 0; i < 90; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const record = uptimeRecords.find(r => {
          const recordDate = new Date(r.date);
          recordDate.setHours(0, 0, 0, 0);
          return recordDate.getTime() === date.getTime();
        });
        
        uptimeData.push(record?.status || 'e');
      }
      
      // Calculate uptime percentage (last 30 days)
      const last30Days = uptimeData.slice(0, 30);
      const operationalDays = last30Days.filter(status => status === 'o').length;
      const uptimePercentage = last30Days.length > 0 
        ? ((operationalDays / last30Days.length) * 100).toFixed(2)
        : '0.00';
      
      // Determine current status
      const recentStatus = uptimeData[0] || 'e';
      let currentStatus: 'operational' | 'degraded' | 'outage';
      
      switch (recentStatus) {
        case 'o':
          currentStatus = 'operational';
          break;
        case 'po':
          currentStatus = 'degraded';
          break;
        case 'mo':
          currentStatus = 'outage';
          break;
        default:
          currentStatus = 'operational'; // Default for 'nd' and 'e'
      }
      
      return {
        ...service,
        uptime_records: undefined, // Remove from response
        currentStatus,
        uptimePercentage,
        uptimeData,
      } as ServiceWithStats;
    });
  }
}

export default ServiceModel;