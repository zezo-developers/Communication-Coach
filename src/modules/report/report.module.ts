import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportController } from './controllers/report.controller';
import { ReportService } from './services/report.service';
import { Report, ReportSchema } from '@/database/schemas/report.schema';
import {
  ReportFeedback,
  ReportFeedbackSchema,
} from '@/database/schemas/reportFeedback.schema';
import {
  ConversationTurn,
  ConversationTurnSchema,
} from '@/database/schemas/conversationTurn.schema';
import {
  RolePlaySession,
  RolePlaySessionSchema,
} from '@/database/schemas/rolePlaySession.schema';
import {
  Pronunciation,
  PronunciationSchema,
} from '@/database/schemas/pronunciation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: ReportFeedback.name, schema: ReportFeedbackSchema },
      { name: ConversationTurn.name, schema: ConversationTurnSchema },
      { name: RolePlaySession.name, schema: RolePlaySessionSchema },
      { name: Pronunciation.name, schema: PronunciationSchema },
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
