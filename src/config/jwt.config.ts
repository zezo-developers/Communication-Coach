import { registerAs } from '@nestjs/config';

/**
 * JWT configuration factory
 * Provides type-safe configuration for JWT token generation and validation
 */
export const jwtConfig = registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  resetPasswordSecret: process.env.JWT_RESET_PASSWORD_SECRET || 'your-super-secret-reset-key-change-in-production',
}));

/**
 * JWT configuration interface for type safety
 */
export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}
