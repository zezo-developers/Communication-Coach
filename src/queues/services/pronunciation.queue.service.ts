import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_NAMES, QUEUE_NAMES } from '../queue.constants';
import { IAnalyzePronunciationPayload } from '../types/pronunciation.queue.types';

@Injectable()
export class PronunciationQueueService {
  constructor(
    @InjectQueue(QUEUE_NAMES.PRONUNCIATION)
    private readonly pronunciationQueue: Queue,
  ) {}

  async analyzeTurn(payload: IAnalyzePronunciationPayload): Promise<void> {
    await this.pronunciationQueue.add(
      JOB_NAMES.PRONUNCIATION.ANALYZE_TURN,
      payload,
      {
        jobId: payload.turnId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }
}
