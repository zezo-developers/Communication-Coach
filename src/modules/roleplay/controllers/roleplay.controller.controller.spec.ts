import { Test, TestingModule } from '@nestjs/testing';
import { RoleplayController } from './roleplay.controller.controller';
import { RoleplayService } from '../services/roleplay.service.service';

describe('RoleplayController', () => {
  let controller: RoleplayController;

  // The controller is a thin pass-through, so a stub service is all it needs.
  const roleplayService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoleplayController],
      providers: [{ provide: RoleplayService, useValue: roleplayService }],
    }).compile();

    controller = module.get<RoleplayController>(RoleplayController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
