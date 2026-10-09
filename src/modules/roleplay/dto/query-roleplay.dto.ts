import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { RolePlayDifficulty } from '@/database/schemas/rolePlay.schema';

/** Fields a client is allowed to sort by. The service re-checks this allowlist. */
export const ROLEPLAY_SORT_FIELDS = [
  'title',
  'category',
  'difficulty',
  'createdAt',
  'updatedAt',
] as const;

export const ROLEPLAY_DEFAULT_SORT_FIELD = 'createdAt';

export type RolePlaySortField = (typeof ROLEPLAY_SORT_FIELDS)[number];

export class QueryRolePlayDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive search across title and description',
    example: 'negotiation',
  })
  @IsOptional()
  @IsString({ message: 'search must be a valid string' })
  @MaxLength(100, { message: 'search must not exceed 100 characters' })
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by category (exact match)',
    example: 'workplace-communication',
  })
  @IsOptional()
  @IsString({ message: 'category must be a valid string' })
  @MaxLength(100, { message: 'category must not exceed 100 characters' })
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter by difficulty level',
    enum: RolePlayDifficulty,
    example: RolePlayDifficulty.INTERMEDIATE,
  })
  @IsOptional()
  @IsIn(Object.values(RolePlayDifficulty), {
    message: `difficulty must be one of: ${Object.values(RolePlayDifficulty).join(', ')}`,
  })
  difficulty?: RolePlayDifficulty;

  @ApiPropertyOptional({
    description:
      'Filter by availability. Omit to return both active and inactive scenarios.',
    example: true,
  })
  @IsOptional()
  // Query params arrive as strings, so "true"/"false" must be converted
  // explicitly; other values are left untouched for @IsBoolean to reject.
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: [...ROLEPLAY_SORT_FIELDS],
    example: ROLEPLAY_DEFAULT_SORT_FIELD,
    default: ROLEPLAY_DEFAULT_SORT_FIELD,
  })
  @IsOptional()
  @IsIn([...ROLEPLAY_SORT_FIELDS], {
    message: `sortBy must be one of: ${ROLEPLAY_SORT_FIELDS.join(', ')}`,
  })
  sortBy?: RolePlaySortField = ROLEPLAY_DEFAULT_SORT_FIELD;

  @ApiPropertyOptional({
    description: 'Sorting direction',
    enum: ['asc', 'desc'],
    example: 'desc',
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be either asc or desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
