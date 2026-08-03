import ServiceModel from '../models/service';
import { Service } from '@prisma/client';

export class SystemService {
  async getAllServices(): Promise<{ services: Service[] }> {
    try {
      const services = await ServiceModel.findAll();
      return { services };
    } catch (error) {
      console.error('Error getting all services:', error);
      throw new Error('Failed to retrieve services');
    }
  }

  async createService(serviceData: {
    id: string;
    name: string;
    description?: string;
    endpoint_url?: string;
  }): Promise<Service> {
    try {
      // Validate service ID format (kebab-case)
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(serviceData.id)) {
        throw new Error('Service ID must be in kebab-case format');
      }

      // Check if service already exists
      const existingService = await ServiceModel.findById(serviceData.id);
      if (existingService) {
        throw new Error('Service with this ID already exists');
      }

      // Validate endpoint URL if provided
      if (serviceData.endpoint_url) {
        try {
          new URL(serviceData.endpoint_url);
        } catch {
          throw new Error('Invalid endpoint URL format');
        }
      }

      return await ServiceModel.create({
        id: serviceData.id,
        name: serviceData.name,
        description: serviceData.description ?? null,
        endpoint_url: serviceData.endpoint_url ?? null,
      });
    } catch (error: any) {
      console.error('Error creating service:', error);
      throw new Error(error.message || 'Failed to create service');
    }
  }

  async updateService(
    serviceId: string,
    updateData: {
      name?: string;
      description?: string;
      endpoint_url?: string;
    }
  ): Promise<Service> {
    try {
      // Check if service exists
      const existingService = await ServiceModel.findById(serviceId);
      if (!existingService) {
        throw new Error('Service not found');
      }

      // Validate endpoint URL if provided
      if (updateData.endpoint_url) {
        try {
          new URL(updateData.endpoint_url);
        } catch {
          throw new Error('Invalid endpoint URL format');
        }
      }

      return await ServiceModel.update(serviceId, updateData);
    } catch (error: any) {
      console.error(`Error updating service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to update service');
    }
  }

  async deleteService(serviceId: string): Promise<Service> {
    try {
      // Check if service exists
      const existingService = await ServiceModel.findById(serviceId);
      if (!existingService) {
        throw new Error('Service not found');
      }

      return await ServiceModel.delete(serviceId);
    } catch (error: any) {
      console.error(`Error deleting service ${serviceId}:`, error);
      throw new Error(error.message || 'Failed to delete service');
    }
  }

  async getService(serviceId: string): Promise<Service | null> {
    return await ServiceModel.findById(serviceId);
  }
}

export default new SystemService();
