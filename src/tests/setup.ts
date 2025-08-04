// @ts-nocheck
// Test setup file for Jest
import '@jest/globals';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test_db';
process.env.JWT_SECRET = 'test-jwt-secret';

// Global test utilities
global.console = {
  ...console,
  // Uncomment to suppress console.log during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Mock Prisma client for all tests
jest.mock('../utils/database', () => ({
  dbConnection: {
    getPrismaClient: jest.fn(() => ({
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      user: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      currency: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      vendor: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      expenseCategory: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      expense: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      journalEntry: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      journalEntryLine: { findMany: jest.fn(), create: jest.fn() },
      chartOfAccounts: { findMany: jest.fn(), findFirst: jest.fn() }
    }))
  }
}));

// Mock logger to prevent console output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
})); 