import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const ROLEPLAY_PERSONA_GENDERS = ['male', 'female', 'neutral'] as const;

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

  @ApiPropertyOptional({
    description: 'Voice gender style for the persona when generating spoken output.',
    enum: ROLEPLAY_PERSONA_GENDERS,
    example: 'male',
  })
  @IsOptional()
  @IsIn(ROLEPLAY_PERSONA_GENDERS, {
    message: `Gender must be one of: ${ROLEPLAY_PERSONA_GENDERS.join(', ')}`,
  })
  gender?: (typeof ROLEPLAY_PERSONA_GENDERS)[number];

  @ApiPropertyOptional({
    description:
      'OpenAI TTS configuration object. Example: { voice: "nova", language: "en-US", style: "friendly" }',
    example: { voice: 'nova', language: 'en-US', style: 'friendly' },
    additionalProperties: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsObject({ message: 'voiceConfig must be a valid object' })
  voiceConfig?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Avatar image URL for the persona. Usually set by the server after a file upload.',
    example: 'https://cdn.example.com/roleplay/avatars/alex.png',
  })
  @IsOptional()
  @IsString({ message: 'Avatar URL must be a valid string' })
  avatarUrl?: string;
}

export class UpdateRolePlayPersonaDto extends PartialType(
  CreateRolePlayPersonaDto,
) {}
