import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Report,
  ReportDocument,
  ReportStatus,
} from '@/database/schemas/report.schema';
import {
  ReportFeedback,
  ReportFeedbackDocument,
} from '@/database/schemas/reportFeedback.schema';
import {
  ConversationTurn,
  ConversationTurnDocument,
} from '@/database/schemas/conversationTurn.schema';
import {
  RolePlaySession,
  RolePlaySessionDocument,
} from '@/database/schemas/rolePlaySession.schema';
import { ListReportsDto } from '@/modules/recording/dto/list-reports.dto';

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(ReportFeedback.name)
    private readonly feedbackModel: Model<ReportFeedbackDocument>,
    @InjectModel(ConversationTurn.name)
    private readonly conversationModel: Model<ConversationTurnDocument>,
    @InjectModel(RolePlaySession.name)
    private readonly sessionModel: Model<RolePlaySessionDocument>,
  ) {}

  async listForUser(userId: string, dto: ListReportsDto) {
    // Match both ObjectId and string-stored userId for backward compatibility
    const userIdOr = [
      Types.ObjectId.isValid(userId) ? { userId: new Types.ObjectId(userId) } : null,
      { userId },
    ].filter(Boolean) as any[];

    const base: any = userIdOr.length > 1 ? { $or: userIdOr } : userIdOr[0];

    // Optional filters
    const andFilters: any[] = [];

    if (dto.sessionId) {
      const sid = dto.sessionId;
      andFilters.push({
        $or: [
          Types.ObjectId.isValid(sid) ? { sessionId: new Types.ObjectId(sid) } : null,
          { sessionId: sid },
        ].filter(Boolean),
      });
    }

    if (dto.status) {
      andFilters.push({ status: dto.status as ReportStatus });
    }

    if (dto.createdFrom || dto.createdTo) {
      const createdAt: any = {};
      if (dto.createdFrom) createdAt.$gte = new Date(dto.createdFrom);
      if (dto.createdTo) createdAt.$lte = new Date(dto.createdTo);
      andFilters.push({ createdAt });
    }

    // Text search (case-insensitive) on summary
    if (dto.search) {
      andFilters.push({ summary: { $regex: dto.search, $options: 'i' } });
    }

    // Score range; include reports with no overallScore as well to avoid hiding in-progress ones
    if (dto.minScore != null || dto.maxScore != null) {
      const score: any = {};
      if (dto.minScore != null) score.$gte = dto.minScore;
      if (dto.maxScore != null) score.$lte = dto.maxScore;
      andFilters.push({ $or: [{ overallScore: score }, { overallScore: { $exists: false } }] });
    }

    const finalQuery = andFilters.length ? { $and: [base, ...andFilters] } : base;

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const sortBy = dto.sortBy ?? 'createdAt';
    const order = (dto.order ?? 'desc') === 'asc' ? 1 : -1;

    const [items, total] = await Promise.all([
      this.reportModel
        .find(finalQuery)
        .sort({ [sortBy]: order })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.reportModel.countDocuments(finalQuery).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      sortBy,
      order: order === 1 ? 'asc' : 'desc',
    };
  }

  async getDetailByReportId(userId: string, reportId: string) {
    if (!Types.ObjectId.isValid(reportId)) {
      throw new BadRequestException('Invalid report id');
    }

    const report = await this.reportModel.findById(reportId).lean().exec();
    if (!report) throw new BadRequestException('Report not found');
    if (String(report.userId) !== String(userId)) {
      throw new BadRequestException(
        'This report does not belong to the authenticated user',
      );
    }

    const [feedback, session, turns] = await Promise.all([
      this.feedbackModel.findOne({ reportId: report._id }).lean().exec(),
      this.sessionModel.findById(report.sessionId).lean().exec(),
      this.conversationModel
        .find({ sessionId: report.sessionId })
        .sort({ sequence: 1, createdAt: 1 })
        .lean()
        .exec(),
    ]);

    return {
      report,
      feedback,
      conversation: {
        sessionId: report.sessionId,
        session,
        turns,
      },
    };
  }
}
