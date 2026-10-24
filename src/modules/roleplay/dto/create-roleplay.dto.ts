import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RolePlayDifficulty } from '@/database/schemas/rolePlay.schema';
import { CreateRolePlayPersonaDto } from './roleplay-persona.dto';

export class CreateRolePlayDto {
  @ApiProperty({
    description: 'Short, human-readable title of the scenario',
    example: 'Negotiating a Salary Increase',
  })
  @IsString({ message: 'Title must be a valid string' })
  @MinLength(3, { message: 'Title must be at least 3 characters long' })
  @MaxLength(150, { message: 'Title must not exceed 150 characters' })
  title!: string;

  @ApiProperty({
    description: 'What the scenario is about and who it is for',
    example:
      'A learner practises asking their manager for a raise after a strong quarter.',
  })
  @IsString({ message: 'Description must be a valid string' })
  @MinLength(10, { message: 'Description must be at least 10 characters long' })
  @MaxLength(2000, {
    message: 'Description must not exceed 2000 characters',
  })
  description!: string;

  @ApiProperty({
    description: 'Grouping used by the catalogue filters',
    example: 'workplace-communication',
  })
  @IsString({ message: 'Category must be a valid string' })
  @MinLength(2, { message: 'Category must be at least 2 characters long' })
  @MaxLength(100, { message: 'Category must not exceed 100 characters' })
  category!: string;

  @ApiPropertyOptional({
    description: 'Difficulty level of the scenario',
    enum: RolePlayDifficulty,
    example: RolePlayDifficulty.INTERMEDIATE,
    default: RolePlayDifficulty.INTERMEDIATE,
  })
  @IsOptional()
  @IsIn(Object.values(RolePlayDifficulty), {
    message: `Difficulty must be one of: ${Object.values(RolePlayDifficulty).join(', ')}`,
  })
  difficulty?: RolePlayDifficulty;

  @ApiProperty({
    description: 'System prompt that drives the AI conversation',
    example:
      'You are a busy hiring manager. Stay in character and push back on vague answers.',
  })
  @IsString({ message: 'System prompt must be a valid string' })
  @MinLength(10, {
    message: 'System prompt must be at least 10 characters long',
  })
  @MaxLength(8000, {
    message: 'System prompt must not exceed 8000 characters',
  })
  systemPrompt!: string;

  @ApiProperty({
    description: 'The persona the AI plays during the session',
    type: CreateRolePlayPersonaDto,
    example: {
      name: 'Alex Morgan',
      role: 'Hiring manager running a screening call',
      personality: 'Direct but fair, asks follow-up questions',
      gender: 'male',
      voiceConfig: {
        voice: 'alloy',
        language: 'en-US',
        style: 'friendly',
      },
    },
  })
  @Transform(
    ({ value }) => {
      if (typeof value !== 'string') {
        return value;
      }

      try {
        const parsed = JSON.parse(value);

        if (
          parsed === null ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed)
        ) {
          return value;
        }

        return plainToInstance(CreateRolePlayPersonaDto, parsed);
      } catch {
        return value;
      }
    },
    { toClassOnly: true },
  )
  @ValidateNested()
  aiPersona!: CreateRolePlayPersonaDto;

  @ApiPropertyOptional({
    description: 'Optional avatar image for the persona',
    type: 'string',
    format: 'binary',
  })
  avatar?: Express.Multer.File;

  @ApiPropertyOptional({
    description: 'Learning objectives the session should cover',
    example: ['Anchor on data', 'Handle an outright refusal'],
    type: [String],
  })
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const normalizeList = (items: unknown): string[] =>
      (Array.isArray(items) ? items : [items])
        .filter((item) => item !== undefined && item !== null && item !== '')
        .map((item) =>
          typeof item === 'string' ? item.trim() : String(item).trim(),
        )
        .filter((item) => item.length > 0);

    if (Array.isArray(value)) {
      return normalizeList(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return normalizeList(parsed);
        }
      } catch {
        // fall through to comma-separated/single-value handling below
      }

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return normalizeList(trimmed.slice(1, -1).split(','));
      }

      if (trimmed.includes(',')) {
        return normalizeList(trimmed.split(','));
      }

      return [trimmed];
    }

    return normalizeList(value);
  })
  @IsOptional()
  @IsArray({ message: 'Objectives must be an array of strings' })
  @IsString({ each: true, message: 'Each objective must be a valid string' })
  @ArrayMaxSize(20, {
    message: 'Objectives must not contain more than 20 items',
  })
  objectives?: string[];

  @ApiPropertyOptional({
    description: 'Whether the scenario is available to learners',
    example: true,
    default: true,
  })
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;
}
