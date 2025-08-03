// @ts-nocheck
import { PrismaClient } from '@prisma/client';

export class DatabaseConnection {
  private static instance: DatabaseConnection;
  private prisma: PrismaClient;
  
  private constructor() {
    this.prisma = new PrismaClient();
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
