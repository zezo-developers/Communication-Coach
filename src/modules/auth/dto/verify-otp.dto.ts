import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ description: 'Email address that received the OTP', example: 'johndoe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ description: '6-digit OTP code sent to the email', example: '423871' })
  @IsString({ message: 'OTP must be a valid string' })
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp!: string;
}