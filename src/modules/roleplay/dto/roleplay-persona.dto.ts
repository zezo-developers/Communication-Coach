import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The AI persona the learner talks to. Reused by the create and update DTOs so
 * both stay in sync with `RolePlayPersona` in the schema.
 */
export class CreateRolePlayPersonaDto {
  @ApiProperty({
    description: 'Display name of the AI persona',
    example: 'Alex Morgan',
  })
  @IsString({ message: 'Persona name must be a valid string' })
  @MinLength(1, { message: 'Persona name must be at least 1 character long' })
  @MaxLength(100, { message: 'Persona name must not exceed 100 characters' })
  name!: string;

  @ApiProperty({
    description: 'Role the persona plays inside the scenario',
    example: 'Hiring manager running a screening call',
  })
  @IsString({ message: 'Persona role must be a valid string' })
  @MinLength(1, { message: 'Persona role must be at least 1 character long' })
  @MaxLength(150, { message: 'Persona role must not exceed 150 characters' })
  role!: string;

  @ApiPropertyOptional({
    description: 'Tone and behavioural traits the AI should adopt',
    example: 'Direct but fair, asks follow-up questions, rarely praises',
  })
  @IsOptional()
  @IsString({ message: 'Personality must be a valid string' })
  @MaxLength(1000, { message: 'Personality must not exceed 1000 characters' })
  personality?: string;
}

export class UpdateRolePlayPersonaDto extends PartialType(
  CreateRolePlayPersonaDto,
) {}
