import {
  Controller, Post, Get, Patch, Body, UseGuards, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { UpdateSelfDto } from '../dto/update-self.dto';
import { AuthenticatedUser } from '../strategies/jwt.strategy';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─── Register ──────────────────────────────────────────────────────────────
  // Creates a pending account with email, password, and name; sends verification OTP.
  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account and sends an OTP to the registered email for verification. The account must be verified before full access is granted.',
  })
  @ApiBody({ type: RegisterDto })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─── Verify Email ──────────────────────────────────────────────────────────
  // Verifies the user's email using the 6-digit OTP sent during registration.
  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify email with OTP',
    description:
      'Verifies the user email using the 6-digit OTP code sent during registration. Sets the account status to active upon successful verification.',
  })
  @ApiBody({ type: VerifyOtpDto })
  async verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmail(dto);
  }

  // ─── Login ─────────────────────────────────────────────────────────────────
  // Authenticates a user with email and password; returns JWT access and refresh tokens.
  @Post('login')
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticates the user using email and password credentials. Returns a JWT access token (short-lived) and a refresh token (long-lived). Email must be verified.',
  })
  @ApiBody({ type: LoginDto })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────────
  // Issues a new access + refresh token pair using a valid refresh token.
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Validates the provided refresh token and issues a new access token and refresh token pair. Used when the access token expires.',
  })
  @ApiBody({ type: RefreshTokenDto })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  // ─── Logout ────────────────────────────────────────────────────────────────
  // Logs out the authenticated user by clearing the refresh token.
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout current user',
    description:
      'Invalidates the refresh token. The access token will expire on its own. Requires a valid JWT token.',
  })
  async logout(@Req() req: any) {
    const user: AuthenticatedUser = req.user;
    return this.authService.logout(user.sub);
  }

  // ─── Whoami ────────────────────────────────────────────────────────────────
  // Returns the profile of the currently authenticated user.
  @Get('whoami')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the profile information of the currently authenticated user. Requires a valid JWT token.',
  })
  async whoami(@Req() req: any) {
    const user: AuthenticatedUser = req.user;
    return this.authService.whoami(user.sub);
  }

  // ─── Update Self ───────────────────────────────────────────────────────────
  // Updates the authenticated user's own profile (firstName, lastName).
  @Patch('update-self')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update own profile',
    description:
      'Updates the authenticated user\'s own profile fields (firstName, lastName). Only provided fields are updated.',
  })
  @ApiBody({ type: UpdateSelfDto })
  async updateSelf(@Req() req: any, @Body() dto: UpdateSelfDto) {
    const user: AuthenticatedUser = req.user;
    return this.authService.updateSelf(user.sub, dto);
  }

  // ─── Forgot Password ───────────────────────────────────────────────────────
  // Sends a password reset OTP to the user's email.
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Send password reset OTP',
    description:
      'Sends a 6-digit OTP to the user\'s email for password reset. If the email is not registered, the response is the same (to avoid email enumeration).',
  })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ─── Reset Password ────────────────────────────────────────────────────────
  // Resets the password using the OTP sent to the user's email.
  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password with OTP',
    description:
      'Resets the user password using the 6-digit OTP sent via the forgot-password endpoint. Requires email, OTP, and the new password.',
  })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}