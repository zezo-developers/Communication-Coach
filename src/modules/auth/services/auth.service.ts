import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { User, Role, UserStatus } from '@/database/schemas/user.schema';
import { OtpType } from '@/database/schemas/otp.schema';
import { OtpService } from './otp.service';
import { EmailService } from 'src/modules/email/services/emails-service.service';
import { S3Service } from 'src/modules/file/services/s3.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { UpdateSelfDto } from '../dto/update-self.dto';

// ─── Constants ───────────────────────────────────────────────────────────────
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
    private readonly s3Service: S3Service,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────
  // Creates a pending account with email, password, and name; sends OTP for email verification.
  async register(dto: RegisterDto) {
    const { firstName, lastName, email, password } = dto;

    // Check if email already exists
    const existing = await this.userModel.findOne({
      email: email.toLowerCase(),
    });
    if (existing) {
      if (existing.emailVerified) {
        throw new BadRequestException(
          'An account with this email already exists',
        );
      }
      // Resend OTP for unverified account
      const otp = await this.otpService.generateOtp(
        email,
        OtpType.EMAIL_VERIFICATION,
      );
      await this.sendOtpEmail(email, otp, 'verify your email');
      return {
        message:
          'An OTP has been sent to your email for verification. Please verify to activate your account.',
      };
    }

    // Hash password using Node.js crypto (scrypt)
    const hashedPassword = await this.hashPassword(password);

    // Create user
    await this.userModel.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: Role.USER,
      status: UserStatus.PENDING,
      emailVerified: false,
    });

    // Generate and send OTP
    const otp = await this.otpService.generateOtp(
      email,
      OtpType.EMAIL_VERIFICATION,
    );
    await this.sendOtpEmail(email, otp, 'verify your email');

    return {
      message:
        'Registration successful. Please check your email for the OTP to verify your account.',
    };
  }

  // ─── Verify Email ──────────────────────────────────────────────────────────
  // Verifies the user's email using the OTP code sent during registration.
  async verifyEmail(dto: VerifyOtpDto) {
    const { email, otp } = dto;

    await this.otpService.verifyOtp(email, otp, OtpType.EMAIL_VERIFICATION);

    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    user.emailVerified = true;
    user.status = UserStatus.ACTIVE;
    await user.save();

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  // Authenticates user with email and password, returns JWT access + refresh tokens.
  async login(
    dto: LoginDto,
  ): Promise<{ user: Partial<User>; tokens: TokenPair }> {
    const { email, password } = dto;

    // Fetch user with password field (excluded by default via `select: false`)
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password +refreshTokenHash');

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isValid = await this.comparePassword(password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if email is verified
    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please check your inbox for the OTP.',
      );
    }

    // Check if blocked
    if (user.isBlocked) {
      throw new UnauthorizedException(
        'Your account has been blocked. Please contact support.',
      );
    }

    // Generate tokens
    const tokens = this.generateTokens(user._id.toString(), user.email);

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────────
  // Validates the refresh token and issues a new access + refresh token pair.
  async refreshToken(dto: RefreshTokenDto): Promise<TokenPair> {
    try {
      const payload = jwt.verify(
        dto.refreshToken,
        this.configService.get<string>('jwt.refreshSecret')!,
      ) as { sub: string; email: string };

      const user = await this.userModel.findById(payload.sub);
      if (!user || !user.emailVerified || user.isBlocked) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.generateTokens(user._id.toString(), user.email);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // ─── Logout ────────────────────────────────────────────────────────────────
  // Logs out the user by clearing the stored refresh token hash.
  async logout(userId: string): Promise<{ message: string }> {
    await this.userModel.updateOne(
      { _id: userId },
      { $unset: { refreshTokenHash: '' } },
    );
    return { message: 'Logged out successfully' };
  }

  // ─── Whoami ────────────────────────────────────────────────────────────────
  // Returns the currently authenticated user's profile.
  async whoami(userId: string): Promise<Partial<User>> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return this.sanitizeUser(user);
  }

  // ─── Update Self ───────────────────────────────────────────────────────────
  // Updates the authenticated user's own profile (firstName, lastName, avatar).
  // A new avatar is uploaded first, so a failed upload leaves the existing
  // profile untouched; the previous image is only deleted once the new URL has
  // been persisted.
  async updateSelf(
    userId: string,
    dto: UpdateSelfDto,
    avatar?: Express.Multer.File,
  ): Promise<Partial<User>> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const hasProfileFields =
      dto.firstName !== undefined || dto.lastName !== undefined;
    if (!hasProfileFields && !avatar) {
      throw new BadRequestException('No fields to update');
    }

    const updateData: Record<string, string> = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;

    // Upload the new avatar before touching the database.
    let uploadedAvatarKey: string | undefined;
    if (avatar) {
      this.assertValidAvatar(avatar);

      const { storagePath, publicUrl } = await this.s3Service.uploadFile(
        avatar.buffer,
        {
          filename: avatar.originalname,
          mimeType: avatar.mimetype,
          sizeBytes: avatar.size,
          userId,
          isPublic: true,
        },
      );

      uploadedAvatarKey = storagePath;
      updateData.avatarUrl =
        publicUrl ?? this.s3Service.getPublicUrlForObjectKey(storagePath);
    }

    const previousAvatarUrl = user.avatarUrl;

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
      .catch(async (error) => {
        // Never leave the freshly uploaded object orphaned if the write fails.
        if (uploadedAvatarKey) {
          await this.deleteStoredFile(
            uploadedAvatarKey,
            'newly uploaded avatar',
          );
        }
        throw error;
      });

    if (!updated) {
      if (uploadedAvatarKey) {
        await this.deleteStoredFile(uploadedAvatarKey, 'newly uploaded avatar');
      }
      throw new BadRequestException('User not found');
    }

    // The new URL is durable now, so the replaced image can be removed.
    if (uploadedAvatarKey && previousAvatarUrl) {
      const previousKey =
        this.s3Service.extractOwnedStoragePath(previousAvatarUrl);

      if (previousKey) {
        await this.deleteStoredFile(previousKey, 'previous avatar');
      } else {
        this.logger.warn(
          `Left previous avatar untouched (not stored in our bucket): ${previousAvatarUrl}`,
        );
      }
    }

    return this.sanitizeUser(updated);
  }

  // ─── Forgot Password ───────────────────────────────────────────────────────
  // Sends an OTP to the user's email for password reset.
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = dto;
    const user = await this.userModel.findOne({ email: email.toLowerCase() });

    // Don't reveal whether the email exists
    if (!user) {
      return {
        message:
          'If an account with this email exists, an OTP has been sent to reset your password.',
      };
    }

    const otp = await this.otpService.generateOtp(
      email,
      OtpType.PASSWORD_RESET,
    );
    await this.sendOtpEmail(email, otp, 'reset your password');

    return {
      message:
        'If an account with this email exists, an OTP has been sent to reset your password.',
    };
  }

  // ─── Reset Password ────────────────────────────────────────────────────────
  // Verifies OTP and updates the user's password.
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const { email, otp, newPassword } = dto;

    await this.otpService.verifyOtp(email, otp, OtpType.PASSWORD_RESET);

    const hashedPassword = await this.hashPassword(newPassword);
    await this.userModel.updateOne(
      { email: email.toLowerCase() },
      { $set: { password: hashedPassword } },
    );

    return {
      message:
        'Password has been reset successfully. You can now log in with your new password.',
    };
  }

  // ─── JWT Token Generation ──────────────────────────────────────────────────
  // Generates an access token (short-lived) and a refresh token (long-lived).
  private generateTokens(userId: string, email: string): TokenPair {
    const secret = this.configService.get<string>('jwt.secret')!;
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret')!;
    const expiresIn = this.configService.get<string>('jwt.expiresIn')!;
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
    )!;

    // Convert human-readable durations to numeric seconds for jsonwebtoken v9 compat
    const expiresInSeconds = this.parseExpiresIn(expiresIn);
    const refreshExpiresInSeconds = this.parseExpiresIn(refreshExpiresIn);

    const accessToken = jwt.sign({ sub: userId, email }, secret, {
      expiresIn: expiresInSeconds,
    });

    const refreshToken = jwt.sign({ sub: userId, email }, refreshSecret, {
      expiresIn: refreshExpiresInSeconds,
    });

    return { accessToken, refreshToken, expiresIn: expiresInSeconds };
  }

  // ─── Password Hashing (Node.js crypto.scrypt) ──────────────────────────────
  // Hashes a password using scrypt with a random salt.
  // eslint-disable-next-line @typescript-eslint/require-await
  private async hashPassword(password: string) {
    const salt = randomBytes(SALT_LENGTH);
    const hash = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
    return `${salt.toString('base64')}:${hash.toString('base64')}`;
  }

  // ─── Password Verification ─────────────────────────────────────────────────
  // Compares a password against a stored hash using constant-time comparison.
  // eslint-disable-next-line @typescript-eslint/require-await
  private async comparePassword(
    password: string,
    hashed: string,
  ): Promise<boolean> {
    const [saltB64, hashB64] = hashed.split(':');
    const salt = Buffer.from(saltB64, 'base64');
    const hash = Buffer.from(hashB64, 'base64');
    const derivedKey = scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
    if (derivedKey.length !== hash.length) {
      return false;
    }
    return timingSafeEqual(derivedKey, hash);
  }

  // ─── Parse ExpiresIn ───────────────────────────────────────────────────────
  // Parses a human-readable expiry string (e.g. '15m', '24h', '7d') to seconds.
  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 3600; // default 1 hour
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 3600;
    }
  }

  // ─── Send OTP Email ────────────────────────────────────────────────────────
  // Sends an OTP email via the EmailService.
  private async sendOtpEmail(
    email: string,
    otp: string,
    purpose: string,
  ): Promise<void> {
    try {
      await this.emailService.sendEmail({
        to: email,
        subject: `Communication Coach - OTP to ${purpose}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Communication Coach</h2>
            <p>Your OTP to <strong>${purpose}</strong> is:</p>
            <h1 style="letter-spacing: 4px; background: #f3f3f3; padding: 16px; text-align: center;">${otp}</h1>
            <p>This code expires in <strong>10 minutes</strong>.</p>
            <p style="color: #888; font-size: 12px;">If you did not request this, please ignore this email.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}: ${error}`);
      // Don't throw — the OTP is stored and can be retried
    }
  }

  // ─── Avatar Validation ─────────────────────────────────────────────────────
  // Guards the upload independently of the controller, so the service stays
  // safe for any other caller.
  private assertValidAvatar(avatar: Express.Multer.File): void {
    if (!avatar.buffer?.length) {
      throw new BadRequestException('Avatar file is empty');
    }

    if (!AVATAR_MIME_TYPES.includes(avatar.mimetype)) {
      throw new BadRequestException(
        `Avatar must be one of: ${AVATAR_MIME_TYPES.join(', ')}`,
      );
    }

    if (avatar.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException(
        `Avatar must not exceed ${AVATAR_MAX_BYTES / (1024 * 1024)} MB`,
      );
    }
  }

  // ─── Storage Cleanup ───────────────────────────────────────────────────────
  // Best-effort delete: a failure here leaves an orphaned object, which is not
  // worth failing a profile update that has already been persisted.
  private async deleteStoredFile(
    storageKey: string,
    label: string,
  ): Promise<void> {
    try {
      await this.s3Service.deleteFile(storageKey);
    } catch (error) {
      this.logger.warn(
        `Failed to delete ${label} from storage (${storageKey}): ${error}`,
      );
    }
  }

  // ─── Sanitize User ─────────────────────────────────────────────────────────
  // Removes sensitive fields from user object before returning to client.
  private sanitizeUser(user: any): Partial<User> {
    const obj = user.toObject ? user.toObject() : { ...user };
    delete obj.password;
    delete obj.refreshTokenHash;
    delete obj.__v;
    return obj;
  }
}
