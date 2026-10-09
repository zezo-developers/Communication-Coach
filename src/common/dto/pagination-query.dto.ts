import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;

/**
 * Shared pagination contract for list endpoints. Extend it and add the
 * feature-specific filters:
 *
 * `export class QueryFooDto extends PaginationQueryDto { ... }`
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Page number to return (1-based)',
    example: 1,
    minimum: 1,
    default: DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be a valid integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: `Number of items per page (max ${MAX_PAGE_LIMIT})`,
    example: 10,
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    default: DEFAULT_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be a valid integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(MAX_PAGE_LIMIT, {
    message: `limit must not exceed ${MAX_PAGE_LIMIT}`,
  })
  limit?: number = DEFAULT_PAGE_LIMIT;
}
