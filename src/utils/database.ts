// @ts-nocheck
import { PrismaClient } from '@prisma/client';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private prisma: PrismaClient;
  
  private constructor() {
    const connectionLimit = process.env.DB_MAX_POOL_SIZE || '10';
    const poolTimeout = process.env.DB_SERVER_SELECTION_TIMEOUT ? 
      (parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT) / 1000).toString() : '20';
    
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL + `&connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`
        }
      }
    });
  }
  
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }
  
  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      console.log('✅ Connected to MySQL database successfully');
    } catch (error) {
      console.error('❌ MySQL connection error:', error);
      // Don't exit process in serverless environment
      if (process.env.NODE_ENV !== 'production') {
        process.exit(1);
      }
    }
  }
  
  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      console.log('📤 Disconnected from MySQL database');
    } catch (error) {
      console.error('❌ Error disconnecting from MySQL:', error);
    }
  }
  
  public getPrismaClient(): PrismaClient {
    return this.prisma;
  }
}

// Export a singleton instance
export const dbConnection = DatabaseConnection.getInstance();
