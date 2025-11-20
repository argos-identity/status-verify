import fs from 'fs';
import path from 'path';
import winston from 'winston';

export interface ParsedEndpoint {
  id: string;
  name: string;
  url: string;
  apiKey: string;
}

export interface ParsedEndpoints {
  endpoints: ParsedEndpoint[];
  apiKey: string;
}

class EndpointParser {
  private static instance: EndpointParser;
  private logger: winston.Logger;

  private constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  public static getInstance(): EndpointParser {
    if (!EndpointParser.instance) {
      EndpointParser.instance = new EndpointParser();
    }
    return EndpointParser.instance;
  }

  public async parseServiceEndpoints(filePath: string): Promise<ParsedEndpoints> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Service endpoint file not found: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() !== '');

      const endpoints: ParsedEndpoint[] = [];
      let apiKey = '';

      // Extract API key (look for the pattern in the file)
      const apiKeyMatch = content.match(/x-api-key=([a-f0-9-]+)/);
      if (apiKeyMatch) {
        apiKey = apiKeyMatch[1];
      }

      // Parse endpoint URLs
      const endpointPatterns = {
        'face-compare': /Face_Compare_URL=(.+)/,
        'id-recognition': /ID_Recognition_URL=(.+)/,
        'face-liveness': /Face_Liveness_URL=(.+)/,
        'id-liveness': /ID_Liveness_URL=(.+)/,
        'curp-verifier': /CURP_Verifier_URL=(.+)/
      };

      const endpointNames = {
        'face-compare': 'Face Compare',
        'id-recognition': 'ID Recognition',
        'face-liveness': 'Face Liveness',
        'id-liveness': 'ID Liveness',
        'curp-verifier': 'CURP Verifier'
      };

      for (const [id, pattern] of Object.entries(endpointPatterns)) {
        const match = content.match(pattern);
        if (match) {
          endpoints.push({
            id,
            name: endpointNames[id as keyof typeof endpointNames],
            url: match[1].trim(),
            apiKey
          });
        }
      }

      if (endpoints.length === 0) {
        throw new Error('No valid endpoints found in service endpoint file');
      }

      this.logger.info(`📋 Parsed ${endpoints.length} service endpoints`, {
        endpoints: endpoints.map(e => ({ id: e.id, name: e.name, url: e.url })),
        apiKeyPresent: !!apiKey
      });

      return { endpoints, apiKey };

    } catch (error: any) {
      this.logger.error('❌ Failed to parse service endpoints', {
        filePath,
        error: error.message
      });
      throw error;
    }
  }

  public async getServiceEndpointsFromProject(): Promise<ParsedEndpoints> {
    // Try to find service-endpoint.txt from the project root
    const possiblePaths = [
      path.join(process.cwd(), '..', 'service-endpoint.txt'),
      path.join(process.cwd(), '..', '..', 'service-endpoint.txt'),
      path.join(__dirname, '..', '..', '..', 'service-endpoint.txt'),
      path.join(__dirname, '..', '..', '..', '..', 'service-endpoint.txt')
    ];

    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        this.logger.info(`🔍 Found service endpoint file: ${filePath}`);
        return await this.parseServiceEndpoints(filePath);
      }
    }

    throw new Error('Service endpoint file not found in any expected location');
  }

  public generateEnvVariables(parsedEndpoints: ParsedEndpoints): string {
    const envLines = [
      '# Service Endpoints (parsed from service-endpoint.txt)',
      `SERVICE_API_KEY=${parsedEndpoints.apiKey}`,
      'SERVICE_AUTH_HEADER=x-api-key',
      ''
    ];

    for (const endpoint of parsedEndpoints.endpoints) {
      const envKey = endpoint.id.toUpperCase().replace('-', '_') + '_URL';
      envLines.push(`${envKey}=${endpoint.url}`);
    }

    return envLines.join('\n');
  }

  public async validateEndpoints(endpoints: ParsedEndpoint[]): Promise<boolean> {
    let allValid = true;

    for (const endpoint of endpoints) {
      try {
        new URL(endpoint.url);
        if (!endpoint.apiKey) {
          this.logger.warn(`⚠️ No API key found for endpoint: ${endpoint.name}`);
          allValid = false;
        }
      } catch (error) {
        this.logger.error(`❌ Invalid URL for endpoint ${endpoint.name}: ${endpoint.url}`);
        allValid = false;
      }
    }

    return allValid;
  }
}

// Export singleton instance
const endpointParser = EndpointParser.getInstance();
export default endpointParser;

// Export the class for testing
export { EndpointParser };