import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';
import { ReportStatus } from '@/database/schemas/report.schema';

export class ListReportsDto {
  @ApiPropertyOptional({ description: 'Filter by session id', example: '66d1d5f1d8d3070019e8f8c9' })
  @IsOptional()
  @IsMongoId()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Filter by report status', enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ description: 'Search keyword in summary (case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Minimum overall score (0-5)', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Maximum overall score (0-5)', example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  maxScore?: number;

  @ApiPropertyOptional({ description: 'Created at from (inclusive) — ISO date', example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Created at to (inclusive) — ISO date', example: '2026-12-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Page size', example: 20, default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Sort by field', example: 'createdAt', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'overallScore';

  @ApiPropertyOptional({ description: 'Sort order', example: 'desc', default: 'desc' })
  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc';
}
