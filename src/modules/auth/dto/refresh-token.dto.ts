import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token issued during login', example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6...' })
  @IsString({ message: 'Refresh token must be a valid string' })
  refreshToken!: string;
}