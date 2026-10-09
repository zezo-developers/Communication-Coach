import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key read by `PermissionsGuard`
 * (src/modules/auth/guards/permissions.guard.ts). That guard reads the literal
 * `'permissions'` string, so the two must stay in sync.
 */
export const PERMISSIONS_KEY = 'permissions';

// Attaches the permission strings a route requires; `PermissionsGuard` enforces them.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
