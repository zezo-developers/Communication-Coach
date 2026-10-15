import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { jwtConfig } from './config/jwt.config';
import { databaseConfig } from './config/database.config';
import { createWinstonLogger } from './config/winston.config';
import { WinstonModule } from 'nest-winston';
import { ThrottlerModule } from '@nestjs/throttler';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { RoleplayModule } from './modules/roleplay/roleplay.module';
import { FileModule } from './modules/file/file.module';
import { RecordingModule } from './modules/recording/recording.module';
import { ReportModule } from './modules/report/report.module';
import { UserStatsModule } from './modules/user-stats/user-stats.module';
import { ConversationCheckModule } from './modules/conversation-check/conversation-check.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      load: [databaseConfig, jwtConfig],
    }),

    // Winston logging module for structured logging
    WinstonModule.forRoot({
      instance: createWinstonLogger(),
    }),

    // Rate limiting module to prevent abuse
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('RATE_LIMIT_TTL', 60),
            limit: configService.get<number>('RATE_LIMIT_MAX', 100),
          },
        ],
      }),
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          uri: configService.get<string>('database.mongoUri'),
        };
      },
    }),

    // ─── Auth Module ─────────────────────────────────────────────────────────
    AuthModule,

    RoleplayModule,

    FileModule,

    RecordingModule,

    ReportModule,

    UserStatsModule,

    ConversationCheckModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
