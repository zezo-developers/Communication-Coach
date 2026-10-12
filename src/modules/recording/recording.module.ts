import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecordingService } from './services/recording.service';
import { RecordingController } from './controllers/recording.controller';
import {
  ConversationTurn,
  ConversationTurnSchema,
} from '@/database/schemas/conversationTurn.schema';
import { Report, ReportSchema } from '@/database/schemas/report.schema';
import {
  ReportFeedback,
  ReportFeedbackSchema,
} from '@/database/schemas/reportFeedback.schema';
import { RolePlay, RolePlaySchema } from '@/database/schemas/rolePlay.schema';
import {
  RolePlaySession,
  RolePlaySessionSchema,
} from '@/database/schemas/rolePlaySession.schema';
import { FileModule } from '@/modules/file/file.module';

@Module({
  imports: [
    FileModule,
    MongooseModule.forFeature([
      { name: ConversationTurn.name, schema: ConversationTurnSchema },
      { name: RolePlay.name, schema: RolePlaySchema },
      { name: RolePlaySession.name, schema: RolePlaySessionSchema },
      { name: Report.name, schema: ReportSchema },
      { name: ReportFeedback.name, schema: ReportFeedbackSchema },
    ]),
  ],
  providers: [RecordingService],
  controllers: [RecordingController],
  exports: [RecordingService],
})
export class RecordingModule {}
