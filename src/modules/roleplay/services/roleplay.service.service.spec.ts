import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RolePlay } from '@/database/schemas/rolePlay.schema';
import { RoleplayService } from './roleplay.service.service';

describe('RoleplayService', () => {
  let service: RoleplayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleplayService,
        { provide: getModelToken(RolePlay.name), useValue: {} },
      ],
    }).compile();

    service = module.get<RoleplayService>(RoleplayService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
