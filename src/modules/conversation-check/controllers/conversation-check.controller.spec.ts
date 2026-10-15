import { Test, TestingModule } from '@nestjs/testing';
import { ConversationMessageRole } from '@/database/schemas/userConversationCheck.schema';
import { ConversationCheckController } from './conversation-check.controller';
import { SubmitConversationTestDto } from '../dto/submit-conversation-test.dto';
import { ConversationCheckService } from '../services/conversation-check.service';

describe('ConversationCheckController', () => {
  let controller: ConversationCheckController;
  let service: {
    generateCasualQuestions: jest.Mock;
    checkConversationTest: jest.Mock;
    submitConversationTest: jest.Mock;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationCheckController],
      providers: [
        {
          provide: ConversationCheckService,
          useValue: {
            generateCasualQuestions: jest.fn(),
            checkConversationTest: jest.fn(),
            submitConversationTest: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ConversationCheckController>(
      ConversationCheckController,
    );
    service = module.get(ConversationCheckService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('generates casual assessment questions', async () => {
    const result = {
      questions: [
        'What do you like to do on weekends?',
        'What is your favorite meal?',
        'How do you usually get to work or school?',
        'What kind of music do you enjoy?',
        'What is something new you would like to learn?',
      ],
    };
    service.generateCasualQuestions.mockResolvedValue(result);

    await expect(controller.generateCasualQuestions()).resolves.toEqual(result);
    expect(service.generateCasualQuestions).toHaveBeenCalledTimes(1);
  });

  it('checks whether the authenticated user is due for an assessment', async () => {
    const userId = '507f1f77bcf86cd799439011';
    service.checkConversationTest.mockResolvedValue(true);

    await expect(
      controller.checkConversationTest({ user: { sub: userId } }),
    ).resolves.toBe(true);
    expect(service.checkConversationTest).toHaveBeenCalledWith(userId);
  });

  it('submits the conversation for the authenticated user', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const dto: SubmitConversationTestDto = {
      conversation: [
        {
          role: ConversationMessageRole.AI,
          message: 'What do you enjoy doing in your free time?',
        },
        {
          role: ConversationMessageRole.USER,
          message: 'I like read books and cooking.',
        },
      ],
    };
    const result = {
      overallScore: 3,
      reCheckConversatonAt: 8,
    };
    service.submitConversationTest.mockResolvedValue(result);

    await expect(
      controller.submitConversationTest({ user: { sub: userId } }, dto),
    ).resolves.toEqual(result);
    expect(service.submitConversationTest).toHaveBeenCalledWith(
      userId,
      dto.conversation,
    );
  });
});
