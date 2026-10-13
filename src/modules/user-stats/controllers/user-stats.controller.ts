import { BadRequestException, Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { UserStatsService } from '../services/user-stats.service';
import { IsDateString, IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

class OverviewQueryDto {
  @IsMongoId()
  userId!: string;

  @IsOptional()
  @IsDateString()
  start?: string;

  @IsOptional()
  @IsDateString()
  end?: string;
}

class RecentSessionsDto {
  @IsMongoId()
  userId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 5;
}

class StrengthsImprovementsDto {
  @IsMongoId()
  userId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  sinceDays: number = 30;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}

class RecommendedPracticeDto {
  @IsMongoId()
  userId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit: number = 3;
}

@ApiTags('User Stats')
@Controller('user-stats')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
@ApiBearerAuth('JWT-auth')
export class UserStatsController {
  constructor(private readonly userStatsService: UserStatsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get overview stats and progress series', description: 'Returns four stat cards and a progress graph for the given user and date range. If start/end are omitted, the current month is used.' })
  @ApiQuery({ name: 'userId', required: true, description: 'User id (Mongo ObjectId)' })
  @ApiQuery({ name: 'start', required: false, description: 'Start ISO date; defaults to first day of current month' })
  @ApiQuery({ name: 'end', required: false, description: 'End ISO date; defaults to last day of current month' })
  async overview(@Query() q: OverviewQueryDto) {
    return this.userStatsService.getOverview(q.userId, q.start, q.end);
  }

  @Get('progress')
  @ApiOperation({ summary: 'Get progress graph series', description: 'Returns only the progress series for the given user and date range. If start/end are omitted, the current month is used.' })
  @ApiQuery({ name: 'userId', required: true, description: 'User id (Mongo ObjectId)' })
  @ApiQuery({ name: 'start', required: false, description: 'Start ISO date; defaults to first day of current month' })
  @ApiQuery({ name: 'end', required: false, description: 'End ISO date; defaults to last day of current month' })
  async progress(@Query() q: OverviewQueryDto) {
    return this.userStatsService.getProgress(q.userId, q.start, q.end);
  }

  @Get('recent-sessions')
  @ApiOperation({ summary: 'Get recent practice sessions', description: 'Returns latest completed sessions with roleplay title, completion date, duration, and report score.' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'limit', required: false, example: 5 })
  async recent(@Query() q: RecentSessionsDto) {
    return this.userStatsService.getRecentSessions(q.userId, q.limit);
  }

  @Get('strengths-improvements')
  @ApiOperation({ summary: 'Get strengths and improvement areas', description: 'Aggregates strengths and growth points from recent feedback.' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'sinceDays', required: false, example: 30 })
  @ApiQuery({ name: 'limit', required: false, example: 5 })
  async strengths(@Query() q: StrengthsImprovementsDto) {
    return this.userStatsService.getStrengthsAndImprovements(q.userId, q.sinceDays, q.limit);
  }

  @Get('recommended-practice')
  @ApiOperation({ summary: 'Get recommended next practice', description: 'Recommends active roleplays tailored to weaker areas. Basic heuristic for MVP.' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'limit', required: false, example: 3 })
  async recommended(@Query() q: RecommendedPracticeDto) {
    return this.userStatsService.getRecommendedPractice(q.userId, q.limit);
  }
}
