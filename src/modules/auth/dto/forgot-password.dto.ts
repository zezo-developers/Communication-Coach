import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ description: 'Registered email address to send password reset OTP', example: 'johndoe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}