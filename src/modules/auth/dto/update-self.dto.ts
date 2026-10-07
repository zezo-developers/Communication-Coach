import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateSelfDto {
  @ApiPropertyOptional({ description: 'Updated first name', example: 'John' })
  @IsOptional()
  @IsString({ message: 'First name must be a valid string' })
  @MinLength(1, { message: 'First name must be at least 1 character long' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Updated last name', example: 'Doe' })
  @IsOptional()
  @IsString({ message: 'Last name must be a valid string' })
  @MinLength(1, { message: 'Last name must be at least 1 character long' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  lastName?: string;
}