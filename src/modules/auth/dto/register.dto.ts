import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: 'First name of the user', example: 'John' })
  @IsString({ message: 'First name must be a valid string' })
  @MinLength(1, { message: 'First name must be at least 1 character long' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  firstName!: string;

  @ApiProperty({ description: 'Last name of the user', example: 'Doe' })
  @IsString({ message: 'Last name must be a valid string' })
  @MinLength(1, { message: 'Last name must be at least 1 character long' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  lastName!: string;

  @ApiProperty({ description: 'Email address of the user', example: 'johndoe@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({ description: 'Password for the account (min 6 characters)', example: 'SecurePass123' })
  @IsString({ message: 'Password must be a valid string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password!: string;
}