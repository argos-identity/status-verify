"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetDatabaseData = resetDatabaseData;
exports.reseedEssentialData = reseedEssentialData;
const client_1 = require("@prisma/client");
const readline = __importStar(require("readline"));
const prisma = new client_1.PrismaClient();
async function confirmReset() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question('⚠️  WARNING: This will delete all data except users. Are you sure? (type "yes" to confirm): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes');
        });
    });
}
async function resetDatabaseData(options = {}) {
    const { skipConfirmation = false, reseedServices = true, preserveUsers = true, } = options;
    if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PRODUCTION_RESET) {
        throw new Error('❌ Data reset is disabled in production environment. Set ALLOW_PRODUCTION_RESET=true to override.');
    }
    if (!skipConfirmation) {
        const confirmed = await confirmReset();
        if (!confirmed) {
            console.log('❌ Reset cancelled.');
            return;
        }
    }
    console.log('🗂️  Starting database data reset...');
    try {
        await prisma.$transaction(async (tx) => {
            console.log('🗑️  Deleting data in correct order to maintain referential integrity...');
            const incidentUpdatesCount = await tx.incidentUpdate.deleteMany({});
            console.log(`✅ Deleted ${incidentUpdatesCount.count} incident updates`);
            const incidentsCount = await tx.incident.deleteMany({});
            console.log(`✅ Deleted ${incidentsCount.count} incidents`);
            const servicesCount = await tx.service.deleteMany({});
            console.log(`✅ Deleted ${servicesCount.count} services`);
            if (!preserveUsers) {
                const usersCount = await tx.user.deleteMany({});
                console.log(`✅ Deleted ${usersCount.count} users`);
            }
            else {
                console.log('👥 Users table preserved');
            }
        });
        console.log('📦 Data deletion completed successfully');
        if (reseedServices) {
            await reseedEssentialData();
        }
        console.log('✅ Database data reset completed successfully!');
    }
    catch (error) {
        console.error('❌ Reset failed:', error);
        throw error;
    }
}
async function reseedEssentialData() {
    console.log('🌱 Re-seeding essential data...');
    const services = [
        {
            id: 'id-recognition',
            name: 'ID Recognition',
            description: 'Identity document recognition and verification service',
            endpoint_url: 'http://localhost:8001/health',
        },
        {
            id: 'face-liveness',
            name: 'Face Liveness',
            description: 'Face liveness detection service',
            endpoint_url: 'http://localhost:8002/health',
        },
        {
            id: 'id-liveness',
            name: 'ID Liveness',
            description: 'ID document liveness verification service',
            endpoint_url: 'http://localhost:8003/health',
        },
        {
            id: 'face-compare',
            name: 'Face Compare',
            description: 'Face comparison and matching service',
            endpoint_url: 'http://localhost:8004/health',
        },
        {
            id: 'curp-verifier',
            name: 'CURP Verifier',
            description: 'CURP (Mexican ID) verification service',
            endpoint_url: 'http://localhost:8005/health',
        },
    ];
    console.log('📦 Creating default services...');
    for (const service of services) {
        await prisma.service.create({
            data: service,
        });
    }
    console.log('✅ Essential data re-seeded successfully');
}
async function main() {
    const args = process.argv.slice(2);
    const skipConfirmation = args.includes('--skip-confirmation');
    const noReseed = args.includes('--no-reseed');
    const includeUsers = args.includes('--include-users');
    try {
        await resetDatabaseData({
            skipConfirmation,
            reseedServices: !noReseed,
            preserveUsers: !includeUsers,
        });
    }
    catch (error) {
        console.error('❌ Reset script failed:', error);
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=reset-data.js.map