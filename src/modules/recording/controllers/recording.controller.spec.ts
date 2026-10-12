import { Test, TestingModule } from '@nestjs/testing';
import { RecordingController } from './recording.controller';

describe('RecordingController', () => {
  let controller: RecordingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecordingController],
    }).compile();

    controller = module.get<RecordingController>(RecordingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
