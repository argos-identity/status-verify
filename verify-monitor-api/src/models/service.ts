import { PrismaClient, Service } from '@prisma/client';

const prisma = new PrismaClient();

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
}

export default ServiceModel;