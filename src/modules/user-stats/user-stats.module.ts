import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserStatsController } from './controllers/user-stats.controller';
import { UserStatsService } from './services/user-stats.service';
import { Report, ReportSchema } from '@/database/schemas/report.schema';
import {
  ReportFeedback,
  ReportFeedbackSchema,
} from '@/database/schemas/reportFeedback.schema';
import {
  RolePlaySession,
  RolePlaySessionSchema,
} from '@/database/schemas/rolePlaySession.schema';
import { RolePlay, RolePlaySchema } from '@/database/schemas/rolePlay.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: ReportFeedback.name, schema: ReportFeedbackSchema },
      { name: RolePlaySession.name, schema: RolePlaySessionSchema },
      { name: RolePlay.name, schema: RolePlaySchema },
    ]),
  ],
  controllers: [UserStatsController],
  providers: [UserStatsService],
})
export class UserStatsModule {}
