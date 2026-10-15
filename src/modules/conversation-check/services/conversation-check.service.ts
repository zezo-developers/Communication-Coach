import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Agent, run } from '@openai/agents';
import { Model, Types } from 'mongoose';
import {
  Report,
  ReportDocument,
  ReportStatus,
} from '@/database/schemas/report.schema';
import {
  ConversationMessageRole,
  UserConversationCheck,
  UserConversationCheckDocument,
  UserConversationCheckStatus,
} from '@/database/schemas/userConversationCheck.schema';
import { SubmitConversationMessageDto } from '../dto/submit-conversation-test.dto';
import { ConversationAssessment } from '../zod/conversation-assessment.schema';

@Injectable()
export class ConversationCheckService {
  private readonly logger = new Logger(ConversationCheckService.name);

  constructor(
    @InjectModel(UserConversationCheck.name)
    private readonly conversationCheckModel: Model<UserConversationCheckDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
  ) {}

  private assertOpenAIConfigured(): void {
    if (!process.env.OPENAI_API_KEY) {
      throw new InternalServerErrorException(
        'OpenAI is not configured on the server',
      );
    }
  }

  async generateCasualQuestions(): Promise<{ questions: string[] }> {
    this.assertOpenAIConfigured();

    const questionAgent = new Agent({
      name: 'English Conversation Level Assessor',
      model: 'gpt-4o-mini',
      instructions: [
        'Create exactly five short, casual questions for a friendly conversation.',
        "The questions should help assess the user's English vocabulary, grammar, sentence framing, and fluency across a range of ability levels.",
        'Use everyday topics, avoid sensitive or personal information, and make each question distinct and easy to answer aloud.',
        'Return only a valid JSON array of five question strings. Do not include markdown or any other text.',
      ].join(' '),
    });

    const result = await run(questionAgent, 'Generate the five questions.');
    const finalOutput = String(result.finalOutput ?? '').trim();
    let parsedQuestions: unknown;
    try {
      parsedQuestions = JSON.parse(finalOutput);
    } catch {
      throw new InternalServerErrorException(
        'OpenAI returned questions in an invalid format',
      );
    }

    if (
      !Array.isArray(parsedQuestions) ||
      parsedQuestions.length !== 5 ||
      parsedQuestions.some(
        (question) => typeof question !== 'string' || !question.trim(),
      )
    ) {
      throw new InternalServerErrorException(
        'OpenAI did not return exactly five valid questions',
      );
    }

    return {
      questions: parsedQuestions.map((question) => question.trim()),
    };
  }

  async checkConversationTest(userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new InternalServerErrorException(
        'Authenticated user id is invalid',
      );
    }

    const userObjectId = new Types.ObjectId(userId);
    const completedReportCount = await this.reportModel
      .countDocuments({
        userId: userObjectId,
        status: ReportStatus.COMPLETED,
      })
      .exec();

    console.log('complete report count', completedReportCount);

    const userConversationCheck = await this.conversationCheckModel
      .findOne({ userId: userObjectId })
      .exec();

    if (!userConversationCheck) {
      const newCheck = new this.conversationCheckModel({
        userId: userObjectId,
      });
      await newCheck.save();
      return true;
    }

    if (userConversationCheck.reCheckConversatonAt === completedReportCount) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const updatedCheck = await this.conversationCheckModel
        .findOneAndUpdate(
          {
            userId: userObjectId,
            reCheckConversatonAt: completedReportCount,
          },
          { $inc: { reCheckConversatonAt: 7 } },
          { new: false },
        )
        .exec();
      return true;
    } else {
      return false;
    }
  }

  async submitConversationTest(
    userId: string,
    conversation: SubmitConversationMessageDto[],
  ): Promise<UserConversationCheckDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new InternalServerErrorException(
        'Authenticated user id is invalid',
      );
    }
    if (
      !conversation.some(
        (message) => message.role === ConversationMessageRole.USER,
      )
    ) {
      throw new BadRequestException(
        'The conversation must include at least one user response',
      );
    }

    this.assertOpenAIConfigured();

    let assessment: ConversationAssessment;
    try {
      const { getConversationAssessmentSchema } =
        await import('../zod/conversation-assessment.schema.js');
      const schema = await getConversationAssessmentSchema();
      const assessmentAgent = new Agent({
        name: 'English Conversation Assessment',
        model: 'gpt-4o-mini',
        instructions: [
          'Assess the user’s English communication ability using only the supplied conversation.',
          'Evaluate the user messages; use AI messages only to understand the questions and context.',
          'Score sentence framing, vocabulary, grammar, fluency, coherence, and confidence from 0 to 5.',
          'Use consistent scoring: 0 means no evidence, 1 means very limited, 2 means developing, 3 means functional, 4 means strong, and 5 means highly proficient.',
          'Choose beginner, intermediate, or advanced based on the overall demonstrated English ability.',
          'Set overallScore to the average of the six category scores, rounded to one decimal place.',
          'Provide concise, evidence-based strengths and actionable improvements. Do not infer personal traits or invent evidence.',
          'Return every field required by the structured output schema.',
        ].join(' '),
        outputType: schema,
      });

      const result = await run(
        assessmentAgent,
        JSON.stringify({ conversation }),
      );
      const output =
        typeof result.finalOutput === 'string'
          ? JSON.parse(result.finalOutput)
          : result.finalOutput;
      assessment = schema.parse(output);
    } catch (error) {
      this.logger.error(
        'Conversation assessment agent failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        'Could not assess the conversation. Please try again.',
      );
    }

    const userObjectId = new Types.ObjectId(userId);
    const assessedAt = new Date();
    const updatedCheck = await this.conversationCheckModel
      .findOneAndUpdate(
        { userId: userObjectId },
        [
          {
            $set: {
              userId: { $literal: userObjectId },
              status: { $literal: UserConversationCheckStatus.COMPLETED },
              lastConversation: { $literal: conversation },
              scores: { $literal: assessment.scores },
              overallScore: { $literal: assessment.overallScore },
              level: { $literal: assessment.level },
              strengths: { $literal: assessment.strengths },
              improvements: { $literal: assessment.improvements },
              assessedAt: { $literal: assessedAt },
              reCheckConversatonAt: {
                $add: [{ $ifNull: ['$reCheckConversatonAt', 1] }, 7],
              },
              createdAt: { $ifNull: ['$createdAt', assessedAt] },
              updatedAt: { $literal: assessedAt },
            },
          },
        ],
        { new: true, upsert: true, updatePipeline: true },
      )
      .exec();

    if (!updatedCheck) {
      throw new InternalServerErrorException(
        'Could not save the conversation assessment',
      );
    }
    return updatedCheck;
  }
}
