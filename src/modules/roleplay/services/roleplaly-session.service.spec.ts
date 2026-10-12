import { Test, TestingModule } from '@nestjs/testing';
import { RoleplalySessionService } from './roleplaly-session.service';

describe('RoleplalySessionService', () => {
  let service: RoleplalySessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleplalySessionService],
    }).compile();

    service = module.get<RoleplalySessionService>(RoleplalySessionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
