// @ts-nocheck
import { PrismaClient } from '@prisma/client';

// Prevent hot reloading from creating new instances in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Create connection parameters with hardcoded values for Aiven Cloud
const connectionLimit = '15'; // Hardcoded to 15 connections
const poolTimeout = '30'; // 30 seconds timeout

// Create the single PrismaClient instance with better connection management
const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL || '';
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}&connect_timeout=60&socket_timeout=60`;
};

export const prisma =
  globalForPrisma.prisma || new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl()
      }
    },
    log: ['error', 'warn'], // Enable logging for debugging
  });

// Store in global to prevent hot reload issues in development
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Add connection health check
export const checkDatabaseConnection = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
};

// Export default for convenience
export default prisma;