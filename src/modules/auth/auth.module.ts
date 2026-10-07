import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { Otp, OtpSchema } from '@/database/schemas/otp.schema';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { AuthController } from './controllers/auth.controller';
import { EmailModule } from 'src/modules/email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Otp.name, schema: OtpSchema },
    ]),
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    OtpService,
    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}