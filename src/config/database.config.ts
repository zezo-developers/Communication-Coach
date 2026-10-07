import { registerAs } from '@nestjs/config';

/**
 * Database configuration factory
 * Provides type-safe configuration for PostgreSQL database connection
 */
export const databaseConfig = registerAs('database', () => {
  return {
    mongoUri: process.env.MONGO_URI || 'localhost',
  };
});

/**
 * Database configuration interface for type safety
 */
export interface DatabaseConfig {
  mongoUri: string;
}
