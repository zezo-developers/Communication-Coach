import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Email address requesting password reset', example: 'johndoe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ description: '6-digit OTP received via email', example: '423871' })
  @IsString({ message: 'OTP must be a valid string' })
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp!: string;

  @ApiProperty({ description: 'New password (min 6 characters)', example: 'NewSecurePass456' })
  @IsString({ message: 'New password must be a valid string' })
  @MinLength(6, { message: 'New password must be at least 6 characters long' })
  newPassword!: string;
}