import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Report } from '@/database/schemas/report.schema';
import { UserConversationCheck } from '@/database/schemas/userConversationCheck.schema';
import { ConversationCheckService } from './conversation-check.service';

describe('ConversationCheckService', () => {
  let service: ConversationCheckService;
  let reportModel: {
    countDocuments: jest.Mock;
  };
  let conversationCheckModel: {
    findOneAndUpdate: jest.Mock;
  };
  let updateResult: jest.Mock;

  beforeEach(async () => {
    updateResult = jest.fn().mockResolvedValue(null);
    reportModel = {
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(3),
      }),
    };
    conversationCheckModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: updateResult }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationCheckService,
        {
          provide: getModelToken(UserConversationCheck.name),
          useValue: conversationCheckModel,
        },
        {
          provide: getModelToken(Report.name),
          useValue: reportModel,
        },
      ],
    }).compile();

    service = module.get<ConversationCheckService>(ConversationCheckService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns false and leaves the threshold unchanged when report count differs', async () => {
    await expect(
      service.checkConversationTest('507f1f77bcf86cd799439011'),
    ).resolves.toBe(false);

    expect(conversationCheckModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        userId: expect.any(Object),
        reCheckConversatonAt: 3,
      },
      { $inc: { reCheckConversatonAt: 7 } },
      { new: false },
    );
  });

  it('returns true and advances the threshold by seven when report count matches', async () => {
    reportModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(1),
    });
    updateResult.mockResolvedValue({ reCheckConversatonAt: 1 });

    await expect(
      service.checkConversationTest('507f1f77bcf86cd799439011'),
    ).resolves.toBe(true);

    expect(conversationCheckModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        userId: expect.any(Object),
        reCheckConversatonAt: 1,
      },
      { $inc: { reCheckConversatonAt: 7 } },
      { new: false },
    );
    expect(reportModel.countDocuments).toHaveBeenCalledWith({
      userId: expect.any(Object),
      status: 'completed',
    });
  });
});
