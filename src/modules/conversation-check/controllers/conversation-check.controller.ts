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
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '@/modules/auth/strategies/jwt.strategy';
import { UserConversationCheckDocument } from '@/database/schemas/userConversationCheck.schema';
import { SubmitConversationTestDto } from '../dto/submit-conversation-test.dto';
import { ConversationCheckService } from '../services/conversation-check.service';

@ApiTags('Conversation Check')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@Controller('conversation-check')
export class ConversationCheckController {
  constructor(
    private readonly conversationCheckService: ConversationCheckService,
  ) {}

  private getAuthenticatedUserId(req: {
    user?: Pick<AuthenticatedUser, 'sub'>;
  }): string {
    const userId = String(req.user?.sub ?? '');
    if (!userId) {
      throw new BadRequestException('Authenticated user id is missing');
    }
    return userId;
  }

  @Post('generate-casual-questions')
  @ApiOperation({
    summary: 'Generate casual English assessment questions',
    description:
      "Uses an AI agent to generate exactly five casual questions for assessing the authenticated user's English level.",
  })
  generateCasualQuestions(): Promise<{ questions: string[] }> {
    return this.conversationCheckService.generateCasualQuestions();
  }

  @Post('check-conversation-test')
  @ApiOperation({
    summary: 'Check whether another conversation assessment is due',
    description:
      'Returns true when the authenticated user has completed the number of reports configured by reCheckConversatonAt. When due, the threshold is advanced by seven reports.',
  })
  checkConversationTest(
    @Req() req: { user?: Pick<AuthenticatedUser, 'sub'> },
  ): Promise<boolean> {
    return this.conversationCheckService.checkConversationTest(
      this.getAuthenticatedUserId(req),
    );
  }

  @Post('submit-conversation-test')
  @ApiOperation({
    summary: 'Submit a conversation for English assessment',
    description:
      'Evaluates the submitted conversation with an AI agent and creates or updates the authenticated user’s conversation assessment.',
  })
  @ApiBody({ type: SubmitConversationTestDto })
  submitConversationTest(
    @Req() req: { user?: Pick<AuthenticatedUser, 'sub'> },
    @Body() dto: SubmitConversationTestDto,
  ): Promise<UserConversationCheckDocument> {
    return this.conversationCheckService.submitConversationTest(
      this.getAuthenticatedUserId(req),
      dto.conversation,
    );
  }
}
