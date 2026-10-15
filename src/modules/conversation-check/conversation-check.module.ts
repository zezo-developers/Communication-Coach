import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Report, ReportSchema } from '@/database/schemas/report.schema';
import {
  UserConversationCheck,
  UserConversationCheckSchema,
} from '@/database/schemas/userConversationCheck.schema';
import { ConversationCheckController } from './controllers/conversation-check.controller';
import { ConversationCheckService } from './services/conversation-check.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserConversationCheck.name, schema: UserConversationCheckSchema },
      { name: Report.name, schema: ReportSchema },
    ]),
  ],
  providers: [ConversationCheckService],
  controllers: [ConversationCheckController],
})
export class ConversationCheckModule {}
