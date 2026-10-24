import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Agent, run } from '@openai/agents';
import { Job } from 'bullmq';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import {
  ConversationTurn,
  ConversationTurnDocument,
} from '@/database/schemas/conversationTurn.schema';
import {
  Pronunciation,
  PronunciationDocument,
} from '@/database/schemas/pronunciation.schema';
import {
  Report,
  ReportDocument,
  ReportStatus,
} from '@/database/schemas/report.schema';
import { configureDigitalOceanAgent } from '@/common/ai/digitalocean-agent.config';
import { JOB_NAMES, QUEUE_NAMES } from '../queue.constants';
import { IAnalyzePronunciationPayload } from '../types/pronunciation.queue.types';

const pythonPronunciationResponseSchema = z.object({
  feedback: z.string(),
  errors: z.array(
    z.object({
      position: z.number().int().min(0),
      word: z.string().min(1),
      expected: z.string(),
      actual: z.string(),
      confidence: z.number().min(0).max(1),
      actual_word: z.string().optional(),
      phone_distance: z.number().optional(),
      phones: z
        .array(
          z.object({
            expected: z.string(),
            heard: z.string(),
            confidence: z.number().min(0).max(1),
          }),
        )
        .optional(),
    }),
  ),
});

const pronunciationAgentOutputSchema = z.object({
  feedback: z.string().min(1),
  explanations: z.array(
    z.object({
      index: z.number().int().min(0),
      explanation: z.string().min(1),
    }),
  ),
});

@Injectable()
@Processor(QUEUE_NAMES.PRONUNCIATION)
export class PronunciationProcessor extends WorkerHost {
  private readonly logger = new Logger(PronunciationProcessor.name);

  constructor(
    @InjectModel(ConversationTurn.name)
    private readonly conversationModel: Model<ConversationTurnDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Pronunciation.name)
    private readonly pronunciationModel: Model<PronunciationDocument>,
  ) {
    super();
  }

  async process(job: Job<IAnalyzePronunciationPayload>): Promise<void> {
    switch (job.name) {
      case JOB_NAMES.PRONUNCIATION.ANALYZE_TURN:
        await this.analyzeTurn(job, job.data);
        return;
      default:
        throw new Error(`Unsupported pronunciation job: ${job.name}`);
    }
  }

  private async analyzeTurn(
    job: Job<IAnalyzePronunciationPayload>,
    payload: IAnalyzePronunciationPayload,
  ): Promise<void> {
    const model = configureDigitalOceanAgent();

    if (!payload.audioBase64) {
      throw new Error('Pronunciation analysis job is missing its audio file');
    }

    const turnId = new Types.ObjectId(payload.turnId);
    const sessionId = new Types.ObjectId(payload.sessionId);
    const [turn, report] = await Promise.all([
      this.conversationModel.findOne({ _id: turnId, sessionId }).lean().exec(),
      this.reportModel
        .findOneAndUpdate(
          { sessionId },
          {
            $setOnInsert: {
              sessionId,
              userId: new Types.ObjectId(payload.userId),
              status: ReportStatus.GENERATING,
            },
          },
          { new: true, upsert: true },
        )
        .exec(),
    ]);

    if (!turn) {
      throw new Error(`Conversation turn ${payload.turnId} was not found`);
    }
    if (!report) {
      throw new Error(
        `Report could not be initialized for ${payload.sessionId}`,
      );
    }

    const pythonResponse = await this.getPythonPronunciationFeedback(payload);
    const agent = new Agent({
      name: 'Professional English Pronunciation Coach',
      model,
      instructions: [
        'You are a professional English pronunciation coach. Explain the specific phoneme-level pronunciation differences returned by the pronunciation analyzer.',
        'Use only the supplied analyzer response; do not add, remove, reorder, or reinterpret its detected errors.',
        'For every error, explain how to physically produce the expected sound using clear, supportive guidance about tongue, lips, teeth, airflow, and voicing when relevant.',
        'Use concise, accessible language for an English learner. Refer to the word and phonemes in the analyzer response, and give a practical pronunciation cue.',
        'Return one explanation for every analyzer error, in the same order, using its zero-based index. If there are no errors, return an empty explanations array and reassuring overall feedback.',
        'Write concise overall feedback that accurately summarizes the analyzer feedback and detected words. Do not discuss transcription or prosody.',
      ].join(' '),
      outputType: pronunciationAgentOutputSchema,
    });

    const result = await run(
      agent,
      JSON.stringify({
        transcript: payload.transcript,
        language: 'en-US',
        analyzerResponse: pythonResponse,
      }),
    );
    const output = pronunciationAgentOutputSchema.parse(result.finalOutput);

    if (
      output.explanations.length !== pythonResponse.errors.length ||
      output.explanations.some(
        (explanation, index) => explanation.index !== index,
      )
    ) {
      throw new Error(
        'Pronunciation agent did not return an explanation for every analyzer error',
      );
    }

    const savedPronunciation = await this.pronunciationModel
      .findOneAndUpdate(
        { reportId: report._id, turnId: turn._id },
        {
          $set: {
            transcript: payload.transcript,
            language: 'en-US',
            feedback: output.feedback,
            errors: pythonResponse.errors.map((error, index) => ({
              position: error.position,
              word: error.word,
              expected: error.expected,
              actual: error.actual,
              confidence: error.confidence,
              explanation: output.explanations[index].explanation,
            })),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (!savedPronunciation) {
      throw new Error(
        `Pronunciation feedback could not be saved for turn ${payload.turnId}`,
      );
    }

    await job.updateData({ ...payload, audioBase64: '' });
    this.logger.log(
      `Pronunciation feedback completed for conversation turn ${payload.turnId}: ${pythonResponse.errors.length} error(s)`,
    );
  }

  private async getPythonPronunciationFeedback(
    payload: IAnalyzePronunciationPayload,
  ) {
    const baseUrl = process.env.PRONUNCIATION_API_BASE_URL;
    if (!baseUrl) {
      throw new Error('PRONUNCIATION_API_BASE_URL is not configured');
    }

    const endpoint = new URL(
      `${baseUrl.replace(/\/+$/, '')}/fast/pronunciation`,
    );
    if (!['http:', 'https:'].includes(endpoint.protocol)) {
      throw new Error('PRONUNCIATION_API_BASE_URL must use http or https');
    }

    const form = new FormData();
    const audio = Buffer.from(payload.audioBase64, 'base64');
    form.append(
      'file',
      new Blob([audio], { type: payload.audioMimeType }),
      payload.audioFileName,
    );
    form.append('expected_text', payload.transcript);
    form.append('lang', 'en');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { accept: '*/*' },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Pronunciation service returned ${response.status}: ${responseText.slice(0, 500)}`,
      );
    }

    const responseBody: unknown = await response.json();
    return pythonPronunciationResponseSchema.parse(responseBody);
  }
}
