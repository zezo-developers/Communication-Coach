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
import { ConversationService } from '../services/conversation.service';
import { GetConversationBySessionDto } from '../dto/get-conversation-by-session.dto';

@ApiTags('Conversation')
@Controller('conversation')
@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@ApiBearerAuth('JWT-auth')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  private getAuthenticatedUserId(req: any): string {
    const user = req.user as AuthenticatedUser;
    const userId = String(user?.sub ?? (user as any)?._id ?? '');
    if (!userId) {
      throw new BadRequestException('Authenticated user id is missing');
    }
    return userId;
  }

  @Post('list-by-session')
  @ApiOperation({
    summary: 'List conversation turns for a session',
    description:
      'Returns all AI and user conversation turns associated with the given session, ordered by their sequence.',
  })
  @ApiBody({ type: GetConversationBySessionDto })
  async listBySession(
    @Req() req: any,
    @Body() dto: GetConversationBySessionDto,
  ) {
    return this.conversationService.listBySession(
      this.getAuthenticatedUserId(req),
      dto.sessionId,
    );
  }
}
