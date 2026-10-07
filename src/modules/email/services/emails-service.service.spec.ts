import { Test, TestingModule } from '@nestjs/testing';
import { EmailsServiceService } from './emails-service.service';

describe('EmailsServiceService', () => {
  let service: EmailsServiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailsServiceService],
    }).compile();

    service = module.get<EmailsServiceService>(EmailsServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
