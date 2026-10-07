import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../strategies/jwt.strategy';

/**
 * Permissions Guard
 * Checks if authenticated user has required permissions for the route
 * Works in conjunction with @RequirePermissions() decorator
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      'permissions',
      [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!user.permissions || user.permissions.length === 0) {
      throw new ForbiddenException('User has no permissions');
    }

    if (!user.permissions || user.permissions.length === 0) {
      throw new ForbiddenException('User has no permissions');
    }

    // Check if user has all required permissions
    const hasAllPermissions = requiredPermissions.every((permission) =>
      this.hasPermission(user.permissions || [], permission),
    );
    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  /**
   * Check if user has a specific permission
   * Supports wildcard permissions (e.g., "users:*" matches "users:read", "users:write")
   */
  private hasPermission(
    userPermissions: string[],
    requiredPermission: string,
  ): boolean {
    // Direct match
    if (userPermissions.includes(requiredPermission)) {
      return true;
    }

    // Check for wildcard permissions
    return userPermissions.some((permission) => {
      if (permission.endsWith('*')) {
        const prefix = permission.slice(0, -1);
        return requiredPermission.startsWith(prefix);
      }
      return false;
    });
  }
}
