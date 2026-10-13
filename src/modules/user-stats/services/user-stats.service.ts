import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument, ReportStatus } from '@/database/schemas/report.schema';
import { RolePlaySession, RolePlaySessionDocument, RolePlaySessionStatus } from '@/database/schemas/rolePlaySession.schema';
import { ReportFeedback, ReportFeedbackDocument } from '@/database/schemas/reportFeedback.schema';
import { RolePlay, RolePlayDocument } from '@/database/schemas/rolePlay.schema';

function getMonthBounds(date = new Date()): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

@Injectable()
export class UserStatsService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(RolePlaySession.name) private readonly sessionModel: Model<RolePlaySessionDocument>,
    @InjectModel(ReportFeedback.name) private readonly feedbackModel: Model<ReportFeedbackDocument>,
    @InjectModel(RolePlay.name) private readonly rolePlayModel: Model<RolePlayDocument>,
  ) {}

  private buildUserMatch(userId: string): Array<Record<string, any>> {
    const arr: Array<Record<string, any>> = [];
    if (Types.ObjectId.isValid(userId)) arr.push({ userId: new Types.ObjectId(userId) });
    arr.push({ userId });
    return arr;
  }

  private parseRange(start?: string, end?: string) {
    if (!start || !end) return getMonthBounds();
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      throw new BadRequestException('Invalid start or end date');
    }
    return { start: s, end: e };
  }

  async getOverview(userId: string, start?: string, end?: string) {
    const { start: from, end: to } = this.parseRange(start, end);
    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs);
    const prevTo = new Date(from.getTime() - 1);

    // Average score current period
    const userOr = this.buildUserMatch(userId);
    const reportMatchBase = {
      status: ReportStatus.COMPLETED,
      $or: userOr,
    } as any;

    const [avgCurrDoc] = await this.reportModel.aggregate([
      { $match: { ...reportMatchBase, createdAt: { $gte: from, $lte: to }, overallScore: { $type: 'number' } } },
      { $group: { _id: null, avg: { $avg: '$overallScore' }, count: { $sum: 1 } } },
    ]);
    const currentAvg = avgCurrDoc?.avg ?? null;
    const currentCount = avgCurrDoc?.count ?? 0;

    const [avgPrevDoc] = await this.reportModel.aggregate([
      { $match: { ...reportMatchBase, createdAt: { $gte: prevFrom, $lte: prevTo }, overallScore: { $type: 'number' } } },
      { $group: { _id: null, avg: { $avg: '$overallScore' } } },
    ]);
    const previousAvg = avgPrevDoc?.avg ?? null;

    let scoreImprovement: { percent?: number; note?: string } = {};
    if (!previousAvg || previousAvg === 0) {
      scoreImprovement = { note: 'Not enough data' };
    } else if (currentAvg != null) {
      scoreImprovement = { percent: ((currentAvg - previousAvg) / previousAvg) * 100 };
    }

    // Completed sessions & practice time
    const [sessionsAgg] = await this.sessionModel.aggregate([
      { $match: { status: RolePlaySessionStatus.COMPLETED, $or: this.buildUserMatch(userId) as any } },
      { $addFields: { refDate: { $ifNull: ['$endedAt', '$createdAt'] } } },
      { $match: { refDate: { $gte: from, $lte: to } } },
      { $group: { _id: null, count: { $sum: 1 }, totalSecs: { $sum: { $ifNull: ['$durationSeconds', 0] } } } },
    ]);
    const completedSessions = sessionsAgg?.count ?? 0;
    const totalPracticeSeconds = sessionsAgg?.totalSecs ?? 0;

    // Progress series: day if <=31 days, otherwise week
    const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
    let series: Array<{ label: string; avgScore: number; count: number; date: string }>=[];
    if (days <= 31) {
      series = await this.reportModel.aggregate([
        { $match: { ...reportMatchBase, createdAt: { $gte: from, $lte: to }, overallScore: { $type: 'number' } } },
        { $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } }, avgScore: { $avg: '$overallScore' }, count: { $sum: 1 } } },
        { $project: { _id: 0, label: '$_id.d', date: '$_id.d', avgScore: 1, count: 1 } },
        { $sort: { date: 1 } },
      ]);
    } else {
      series = await this.reportModel.aggregate([
        { $match: { ...reportMatchBase, createdAt: { $gte: from, $lte: to }, overallScore: { $type: 'number' } } },
        { $group: { _id: { y: { $isoWeekYear: '$createdAt' }, w: { $isoWeek: '$createdAt' } }, avgScore: { $avg: '$overallScore' }, count: { $sum: 1 } } },
        { $project: { _id: 0, label: { $concat: [{ $toString: '$_id.y' }, '-W', { $toString: '$_id.w' }] }, date: { $concat: [{ $toString: '$_id.y' }, '-W', { $toString: '$_id.w' }] }, avgScore: 1, count: 1 } },
        { $sort: { date: 1 } },
      ]);
    }

    return {
      stats: {
        averageScore: currentAvg,
        completedSessions,
        totalPracticeSeconds,
        scoreImprovement,
      },
      period: { start: from, end: to, previousStart: prevFrom, previousEnd: prevTo, currentReportCount: currentCount },
      progress: { series },
    };
  }

  async getRecentSessions(userId: string, limit = 5) {
    const pipeline: any[] = [
      { $match: { status: RolePlaySessionStatus.COMPLETED, $or: this.buildUserMatch(userId) } },
      { $addFields: { refDate: { $ifNull: ['$endedAt', '$createdAt'] } } },
      { $sort: { refDate: -1 } },
      { $limit: Math.max(1, Math.min(limit, 10)) },
      { $lookup: { from: 'roleplays', localField: 'rolePlayId', foreignField: '_id', as: 'roleplay' } },
      { $unwind: { path: '$roleplay', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'reports', localField: '_id', foreignField: 'sessionId', as: 'report' } },
      { $unwind: { path: '$report', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, rolePlayId: 1, endedAt: 1, createdAt: 1, durationSeconds: 1, 'roleplay.title': 1, 'report.overallScore': 1 } },
    ];
    return this.sessionModel.aggregate(pipeline).exec();
  }

  async getProgress(userId: string, start?: string, end?: string) {
    const { progress, period } = await this.getOverview(userId, start, end);
    return { progress, period };
  }

  async getStrengthsAndImprovements(userId: string, sinceDays = 30, limit = 5) {
    const since = new Date(Date.now() - Math.max(1, sinceDays) * 24 * 3600 * 1000);

    // Find recent reports for user
    const reports = await this.reportModel
      .find({ $or: this.buildUserMatch(userId) as any, createdAt: { $gte: since } })
      .select('_id')
      .lean()
      .exec();
    const reportIds = (reports as any[]).map((r) => r._id as Types.ObjectId);
    if (!reportIds.length) {
      return { strengths: [], growthPoints: [] };
    }

    const [strengths, growths] = await Promise.all([
      this.feedbackModel.aggregate([
        { $match: { reportId: { $in: reportIds } } },
        { $unwind: '$strengths' },
        { $group: { _id: '$strengths', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: Math.max(1, Math.min(limit, 20)) },
        { $project: { _id: 0, label: '$_id', count: 1 } },
      ]),
      this.feedbackModel.aggregate([
        { $match: { reportId: { $in: reportIds } } },
        { $unwind: '$growthPoints' },
        { $group: { _id: '$growthPoints', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: Math.max(1, Math.min(limit, 20)) },
        { $project: { _id: 0, label: '$_id', count: 1 } },
      ]),
    ]);

    return { strengths, growthPoints: growths };
  }

  async getRecommendedPractice(userId: string, limit = 3) {
    // Compute weakest areas from recent feedbacks (last 30 days)
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const reports = await this.reportModel
      .find({ $or: this.buildUserMatch(userId) as any, createdAt: { $gte: since } })
      .select('_id')
      .lean()
      .exec();
    const reportIds = (reports as any[]).map((r) => r._id as Types.ObjectId);

    let weakest: 'activeListening' | 'conciseness' | 'star' | null = null;
    if (reportIds.length) {
      const [agg] = await this.feedbackModel.aggregate([
        { $match: { reportId: { $in: reportIds } } },
        {
          $group: {
            _id: null,
            activeListening: { $avg: '$activeListening.score' },
            conciseness: { $avg: '$conciseness.score' },
            star: { $avg: '$star.overallScore' },
          },
        },
      ]);
      if (agg) {
        const entries: Array<[string, number]> = [
          ['activeListening', agg.activeListening ?? Infinity],
          ['conciseness', agg.conciseness ?? Infinity],
          ['star', agg.star ?? Infinity],
        ];
        entries.sort((a, b) => a[1] - b[1]);
        const w = entries[0][1] === Infinity ? null : (entries[0][0] as 'activeListening' | 'conciseness' | 'star');
        weakest = w;
      }
    }

    // Basic recommendation: return active roleplays; if we have a weakest area, try to match it in objectives/systemPrompt
    const textFilter = weakest
      ? {
          $or: [
            { objectives: { $regex: weakest, $options: 'i' } },
            { systemPrompt: { $regex: weakest, $options: 'i' } },
          ],
        }
      : {};

    const items = await this.rolePlayModel
      .find({ isActive: true, ...textFilter })
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(limit, 10)))
      .select({ _id: 1, title: 1, category: 1, difficulty: 1 })
      .lean()
      .exec();

    return { weakestArea: weakest, items };
  }
}
