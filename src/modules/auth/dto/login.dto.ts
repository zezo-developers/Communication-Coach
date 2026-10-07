import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Registered email address', example: 'johndoe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ description: 'Account password', example: 'SecurePass123' })
  @IsString({ message: 'Password must be a valid string' })
  password!: string;
}