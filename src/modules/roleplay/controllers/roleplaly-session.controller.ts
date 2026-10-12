import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from 'src/modules/auth/strategies/jwt.strategy';
import { CreateRolePlaySessionDto } from '../dto/create-roleplay-session.dto';
import { RoleplalySessionService } from '../services/roleplaly-session.service';

@ApiTags('RolePlay Sessions')
@Controller(['roleplaly-session', 'roleplay-sessions'])
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@ApiBearerAuth('JWT-auth')
export class RoleplalySessionController {
  constructor(
    private readonly roleplalySessionService: RoleplalySessionService,
  ) {}

  @Post('create-session')
  @ApiOperation({
    summary: 'Create a roleplay session',
    description:
      'Creates a new roleplay session for the authenticated user, marks previous non-terminal sessions as failed, and returns the first batch of MP3 recording presigned upload URLs.',
  })
  @ApiBody({ type: CreateRolePlaySessionDto })
  async createSession(@Req() req: any, @Body() dto: CreateRolePlaySessionDto) {
    const user = req.user as Partial<AuthenticatedUser> & {
      user?: { _id?: string };
      _id?: string;
      id?: string;
    };
    const userId =
      user?.sub ?? user?.user?._id ?? user?._id ?? user?.id ?? undefined;

    if (!userId) {
      throw new BadRequestException('Authenticated user not found');
    }

    return this.roleplalySessionService.createSession(userId, dto.rolePlayId);
  }
}
