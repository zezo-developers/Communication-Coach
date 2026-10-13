import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '@/modules/auth/strategies/jwt.strategy';
import { ReportService } from '@/modules/report/services/report.service';
import { ListReportsDto } from '@/modules/recording/dto/list-reports.dto';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@ApiBearerAuth('JWT-auth')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  private getAuthenticatedUserId(req: any): string {
    const user = req.user as AuthenticatedUser;
    const userId = String(user?.sub ?? (user as any)?._id ?? '');
    if (!userId) {
      throw new BadRequestException('Authenticated user id is missing');
    }
    return userId;
  }

  // Lists reports with pagination, search and filters for the authenticated user.
  @Get()
  @ApiOperation({
    summary: 'List reports for the current user',
    description:
      'Returns a paginated list of reports for the authenticated user. Supports free-text search, status/score/date filters, and allowlisted sorting.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'communication',
    description: 'Case-insensitive match in summary',
  })
  @ApiQuery({
    name: 'sessionId',
    required: false,
    example: '66d1d5f1d8d3070019e8f8c9',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['generating', 'completed', 'failed'],
  })
  @ApiQuery({ name: 'minScore', required: false, example: 0 })
  @ApiQuery({ name: 'maxScore', required: false, example: 5 })
  @ApiQuery({
    name: 'createdFrom',
    required: false,
    example: '2026-01-01T00:00:00.000Z',
  })
  @ApiQuery({
    name: 'createdTo',
    required: false,
    example: '2026-12-31T23:59:59.999Z',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'overallScore'],
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  list(@Req() req: any, @Query() query: ListReportsDto) {
    return this.reportService.listForUser(
      this.getAuthenticatedUserId(req),
      query,
    );
  }

  @Get(':reportId')
  @ApiOperation({
    summary: 'Get report detail',
    description:
      'Returns the report, its feedback, and all associated conversation turns for the session.',
  })
  @ApiParam({
    name: 'reportId',
    description: 'Report id',
    example: '66d1d5f1d8d3070019e8f8c9',
  })
  getDetail(@Req() req: any, @Param('reportId') reportId: string) {
    return this.reportService.getDetailByReportId(
      this.getAuthenticatedUserId(req),
      reportId,
    );
  }
}
