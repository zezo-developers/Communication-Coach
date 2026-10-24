import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ConversationTurn,
  ConversationTurnSchema,
} from '@/database/schemas/conversationTurn.schema';
import {
  Pronunciation,
  PronunciationSchema,
} from '@/database/schemas/pronunciation.schema';
import { Report, ReportSchema } from '@/database/schemas/report.schema';
import { QUEUE_NAMES } from './queue.constants';
import { PronunciationProcessor } from './processors/pronunciation.processor';
import { PronunciationQueueService } from './services/pronunciation.queue.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        const configuredHost = configService.get<string>('REDIS_HOST');
        let host = configuredHost || '127.0.0.1';
        let port = Number(configService.get<string>('REDIS_PORT', '6379'));
        let username = configService.get<string>('REDIS_USERNAME');
        let password = configService.get<string>('REDIS_PASSWORD');
        let db = Number(configService.get<string>('REDIS_DB', '0'));
        let tls = ['true', '1'].includes(
          configService.get<string>('REDIS_TLS')?.toLowerCase() ?? '',
        );

        if (redisUrl && !configuredHost) {
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(redisUrl);
          } catch {
            throw new Error('REDIS_URL must be a valid Redis URL.');
          }

          if (!['redis:', 'rediss:'].includes(parsedUrl.protocol)) {
            throw new Error(
              'REDIS_URL must use the redis:// or rediss:// protocol.',
            );
          }

          host = parsedUrl.hostname;
          port = Number(
            parsedUrl.port || (parsedUrl.protocol === 'rediss:' ? 6380 : 6379),
          );
          username = parsedUrl.username
            ? decodeURIComponent(parsedUrl.username)
            : username;
          password = parsedUrl.password
            ? decodeURIComponent(parsedUrl.password)
            : password;
          db =
            parsedUrl.pathname.length > 1
              ? Number(parsedUrl.pathname.slice(1))
              : db;
          tls = parsedUrl.protocol === 'rediss:' || tls;
        }

        if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error('Redis host or port configuration is invalid.');
        }
        if (!Number.isInteger(db) || db < 0) {
          throw new Error(
            'Redis database number must be a non-negative integer.',
          );
        }

        return {
          connection: {
            host,
            port,
            username,
            password,
            db,
            ...(tls ? { tls: {} } : {}),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.PRONUNCIATION }),
    MongooseModule.forFeature([
      { name: ConversationTurn.name, schema: ConversationTurnSchema },
      { name: Report.name, schema: ReportSchema },
      { name: Pronunciation.name, schema: PronunciationSchema },
    ]),
  ],
  providers: [PronunciationQueueService, PronunciationProcessor],
  exports: [PronunciationQueueService],
})
export class QueuesModule {}
