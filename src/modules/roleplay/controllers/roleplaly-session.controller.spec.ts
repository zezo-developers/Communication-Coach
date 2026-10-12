import { Test, TestingModule } from '@nestjs/testing';
import { RoleplalySessionController } from './roleplaly-session.controller';

describe('RoleplalySessionController', () => {
  let controller: RoleplalySessionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleplalySessionController],
    }).compile();

    controller = module.get<RoleplalySessionController>(RoleplalySessionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
