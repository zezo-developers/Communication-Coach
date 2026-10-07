import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '@database/schemas/user.schema';


/**
 * JWT payload interface
 */
export interface JwtPayload {
  sub: string; // User ID
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Authenticated user interface with organization context
 * This is the shape attached to `request.user` by Passport after JWT validation.
 */
export interface AuthenticatedUser extends User {
  /** User ID from JWT `sub` claim */
  sub: string;
  permissions?: string[];
}

/**
 * JWT Strategy for validating JWT tokens
 * Implements Passport JWT strategy with user validation and organization context
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  /**
   * Validate JWT payload and return authenticated user
   * Called automatically by Passport when JWT is valid
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const { sub: userId, email } = payload;

    // Find user with active status
    const user = await this.userModel.findOne({ _id: userId, emailVerified: true });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Check if user is verified
    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    // Set current organization (first active membership or null)
    const authenticatedUser: any = {
      ...payload,
      user,
      permissions: user?.role ? this.getUserPermissions(user) : [],
    };

    return authenticatedUser;
  }

  /**
   * Get user permissions based on their role in the current organization
   */
  private getUserPermissions(user: User): string[] {
    // This will be expanded when we implement the full RBAC system
    const basePermissions = ['read:profile', 'update:profile', 'read:organization-analyses'];
    // Add role-based permissions (simplified for now)
    switch (user.role) {
      case 'admin':
        return [
          ...basePermissions,
          'read:users',
          'update:users',
          'delete:users',
          'block:users',
        ];
      case 'user':
        return [
          ...basePermissions,
        ];
      default:
        return basePermissions;
    }
  }
}
