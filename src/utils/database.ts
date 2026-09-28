// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { attachAccountingSnapshotMiddleware } from './prismaAccountingSnapshotMiddleware';
import { attachChartOfAccountsNaturalBalanceMiddleware } from './chartOfAccountsNaturalBalance';
import { attachAuditImmutabilityMiddleware } from './auditImmutability';
import { attachStatusGuardMiddleware } from './statusGuard';
import { attachReconciledPeriodGuard } from './reconciledPeriodGuard';

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

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl()
      }
    },
    log: ['error', 'warn'] // Enable logging for debugging
  });
  // A connection the database refused to open (P1001 "Can't reach database server": seen under bursts of new
  // connections on a local MySQL) means the query never ran, so it is tried again once, briefly later. First, so it
  // wraps every other middleware.
  client.$use(async (params, next) => {
    try {
      return await next(params);
    } catch (e: any) {
      if (e?.code !== 'P1001' && !/Can't reach database server/.test(String(e?.message || ''))) throw e;
      await new Promise((r) => setTimeout(r, 400));
      return next(params);
    }
  });
  attachChartOfAccountsNaturalBalanceMiddleware(client);
  attachAccountingSnapshotMiddleware(client);
  attachAuditImmutabilityMiddleware(client);
  attachStatusGuardMiddleware(client);
  attachReconciledPeriodGuard(client);
  return client;
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

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
