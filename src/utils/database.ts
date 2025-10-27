// @ts-nocheck
import { PrismaClient } from '@prisma/client';

// Prevent hot reloading from creating new instances in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Create connection parameters
const connectionLimit = process.env.DB_MAX_POOL_SIZE || '10';
const poolTimeout = process.env.DB_SERVER_SELECTION_TIMEOUT ? 
  (parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT) / 1000).toString() : '20';

// Create the single PrismaClient instance
export const prisma =
  globalForPrisma.prisma || new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL + `&connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`
      }
    }
  });

// Store in global to prevent hot reload issues in development
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Export default for convenience
export default prisma;