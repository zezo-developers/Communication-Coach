import {
  BadRequestException,
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { Agent, run } from '@openai/agents';
import { S3Service } from '@/modules/file/services/s3.service';
import { CompletedRecordingPartDto } from '../dto/recording-upload.dto';

import {
  ConversationTurn,
  ConversationTurnDocument,
  ConversationSpeaker,
} from '@/database/schemas/conversationTurn.schema';
import {
  Report,
  ReportDocument,
  ReportStatus,
} from '@/database/schemas/report.schema';
import {
  ReportFeedback,
  ReportFeedbackDocument,
} from '@/database/schemas/reportFeedback.schema';
import { RolePlay, RolePlayDocument } from '@/database/schemas/rolePlay.schema';
import {
  RolePlaySession,
  RolePlaySessionDocument,
  RolePlaySessionStatus,
} from '@/database/schemas/rolePlaySession.schema';

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);
  private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(
    @InjectModel(ConversationTurn.name)
    private readonly conversationModel: Model<ConversationTurnDocument>,
    @InjectModel(RolePlay.name)
    private readonly rolePlayModel: Model<RolePlayDocument>,
    @InjectModel(RolePlaySession.name)
    private readonly rolePlaySessionModel: Model<RolePlaySessionDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(ReportFeedback.name)
    private readonly reportFeedbackModel: Model<ReportFeedbackDocument>,
    private readonly s3Service: S3Service,
  ) {}

  private assertOpenAIConfigured(): void {
    if (!process.env.OPENAI_API_KEY) {
      throw new InternalServerErrorException(
        'OpenAI is not configured on the server',
      );
    }
  }

  private async getOwnedSession(
    userId: string,
    sessionId: string,
    rolePlayId?: string,
  ): Promise<RolePlaySessionDocument> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('Invalid session id');
    }
    if (rolePlayId && !Types.ObjectId.isValid(rolePlayId)) {
      throw new BadRequestException('Invalid roleplay id');
    }

    const session = await this.rolePlaySessionModel.findById(sessionId).exec();
    if (!session) throw new BadRequestException('Session not found');
    if (String(session.userId) !== String(userId)) {
      throw new BadRequestException(
        'This session does not belong to the authenticated user',
      );
    }
    if (rolePlayId && String(session.rolePlayId) !== String(rolePlayId)) {
      throw new BadRequestException(
        'The roleplay id does not match this session',
      );
    }
    return session;
  }

  private async nextSequenceForSession(
    sessionId: Types.ObjectId,
  ): Promise<number> {
    const last = await this.conversationModel
      .findOne({ sessionId })
      .sort({ sequence: -1 })
      .select({ sequence: 1 })
      .lean()
      .exec();
    return last ? last.sequence + 1 : 1;
  }

  private getVoiceConfig(
    rolePlay: RolePlayDocument,
    requestedVoice?: string,
  ): { voice: string; language: string; style: string } {
    const persona = (rolePlay as any).aiPersona ?? {};
    const config = persona.voiceConfig ?? {};
    return {
      voice: String(requestedVoice || config.voice || 'nova'),
      language: String(config.language || 'en-US'),
      style: String(config.style || 'friendly'),
    };
  }

  private getRecordingStoragePrefix(
    userId: string,
    rolePlayId: string,
    sessionId: string,
  ): string {
    return `roleplay_recordings/user_${userId}/roleplay_${rolePlayId}/session_${sessionId}`;
  }

  private assertRecordingStoragePath(
    storagePath: string,
    userId: string,
    rolePlayId: string,
    sessionId: string,
  ): void {
    const prefix = this.getRecordingStoragePrefix(
      userId,
      rolePlayId,
      sessionId,
    );
    if (
      !storagePath.startsWith(`${prefix}/`) ||
      !storagePath.endsWith('.mp3')
    ) {
      throw new BadRequestException(
        'storagePath does not belong to this user, roleplay, and session',
      );
    }
  }

  /** Generates real MP3 audio using OpenAI TTS. */
  private async generateAudioDataUrl(
    text: string,
    voice: string,
    language: string,
    style: string,
  ): Promise<string> {
    this.assertOpenAIConfigured();
    const speech = await this.openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      instructions: `Speak in ${language} with a ${style} tone.`,
      response_format: 'mp3',
    });
    const bytes = Buffer.from(await speech.arrayBuffer());
    return `data:audio/mpeg;base64,${bytes.toString('base64')}`;
  }

  /**
   * POST /recording/generate-question
   * Uses the complete ordered conversation as context, creates the next AI turn,
   * and always returns both question text and playable TTS audio.
   */
  async generateQuestionAndSave(
    userId: string,
    rolePlayId: string,
    sessionId: string,
  ): Promise<{
    text: string;
    sequence: number;
    turnId: string;
    audioUrl: string;
    voiceConfig: { voice: string; language: string; style: string };
  }> {
    this.assertOpenAIConfigured();
    if (!Types.ObjectId.isValid(rolePlayId)) {
      throw new BadRequestException('Invalid roleplay id');
    }

    const session = await this.getOwnedSession(userId, sessionId, rolePlayId);
    const rolePlay = await this.rolePlayModel.findById(rolePlayId).exec();
    if (!rolePlay) throw new BadRequestException('Roleplay not found');
    if (!rolePlay.isActive)
      throw new BadRequestException('This roleplay is inactive');

    const turns = await this.conversationModel
      .find({ sessionId: session._id })
      .sort({ sequence: 1 })
      .select({ speaker: 1, text: 1, sequence: 1 })
      .lean()
      .exec();

    const persona = (rolePlay as any).aiPersona ?? {};
    const conversation = turns.length
      ? turns
          .map(
            (turn) =>
              `${turn.speaker === ConversationSpeaker.AI ? 'AI' : 'User'}: ${turn.text}`,
          )
          .join('\n')
      : '(No previous conversation turns. Start the roleplay with an opening question.)';

    const questionAgent = new Agent({
      name: 'Communication Roleplay Interviewer',
      model: 'gpt-4o-mini',
      instructions: [
        'You are conducting a realistic spoken communication roleplay.',
        'Use the roleplay scenario, objectives, persona, and complete conversation history.',
        'Ask exactly ONE natural follow-up question that is easy to answer aloud.',
        'Do not repeat a question already asked. Respond to the latest user answer and move the scenario forward.',
        'If there are no prior turns, ask a relevant opening question.',
        'Return only the question itself. Do not include labels, explanations, markdown, or multiple questions.',
      ].join(' '),
    });

    const prompt = JSON.stringify({
      roleplay: {
        title: rolePlay.title,
        description: rolePlay.description,
        category: rolePlay.category,
        difficulty: rolePlay.difficulty,
        systemPrompt: rolePlay.systemPrompt,
        objectives: rolePlay.objectives,
        persona: {
          name: persona.name,
          role: persona.role,
          personality: persona.personality,
        },
      },
      conversation,
    });

    const agentResult = await run(questionAgent, prompt);
    const questionText = String(agentResult.finalOutput ?? '')
      .trim()
      .replace(/^['"\s]+|['"\s]+$/g, '');
    if (!questionText)
      throw new InternalServerErrorException(
        'OpenAI did not return a question',
      );

    const sequence = await this.nextSequenceForSession(session._id);
    const created = await this.conversationModel.create({
      sessionId: session._id,
      speaker: ConversationSpeaker.AI,
      sequence,
      text: questionText,
    } as Partial<ConversationTurn>);

    const voiceConfig = this.getVoiceConfig(rolePlay);
    let audioUrl: string;
    try {
      audioUrl = await this.generateAudioDataUrl(
        questionText,
        voiceConfig.voice,
        voiceConfig.language,
        voiceConfig.style,
      );
    } catch (error) {
      this.logger.error(
        'TTS generation failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        'The question was saved, but audio generation failed. Please try again later.',
      );
    }

    return {
      text: questionText,
      sequence: created.sequence,
      turnId: String(created._id),
      audioUrl,
      voiceConfig,
    };
  }

  async createRecordingUploadBatch(
    userId: string,
    rolePlayId: string,
    sessionId: string,
    startPartNumber: number,
    partCount: number,
    uploadId?: string,
    storagePath?: string,
  ): Promise<{
    uploadId: string;
    storagePath: string;
    publicUrl: string;
    contentType: string;
    urls: Array<{ partNumber: number; uploadUrl: string; expiresAt: Date }>;
  }> {
    await this.getOwnedSession(userId, sessionId, rolePlayId);

    const hasExistingUpload = Boolean(uploadId || storagePath);
    if (hasExistingUpload && (!uploadId || !storagePath)) {
      throw new BadRequestException(
        'Both uploadId and storagePath are required for an existing recording upload',
      );
    }

    const contentType = 'audio/mpeg';
    let finalUploadId = uploadId;
    let finalStoragePath = storagePath;

    if (!finalUploadId || !finalStoragePath) {
      const prefix = this.getRecordingStoragePrefix(
        userId,
        rolePlayId,
        sessionId,
      );
      finalStoragePath = `${prefix}/recording_${Date.now()}_${new Types.ObjectId().toString()}.mp3`;
      const multipartUpload = await this.s3Service.createMultipartUpload({
        key: finalStoragePath,
        contentType,
        metadata: {
          'user-id': userId,
          'roleplay-id': rolePlayId,
          'session-id': sessionId,
          'recording-type': 'conversation-mixed-audio',
        },
      });
      finalUploadId = multipartUpload.uploadId;
    } else {
      this.assertRecordingStoragePath(
        finalStoragePath,
        userId,
        rolePlayId,
        sessionId,
      );
    }

    const urls: Array<{
      partNumber: number;
      uploadUrl: string;
      expiresAt: Date;
    }> = [];
    for (let i = 0; i < partCount; i++) {
      const partNumber = startPartNumber + i;
      const presigned = await this.s3Service.getPresignedUrlForUploadPart({
        key: finalStoragePath,
        uploadId: finalUploadId,
        partNumber,
      });
      urls.push({ partNumber, ...presigned });
    }

    return {
      uploadId: finalUploadId,
      storagePath: finalStoragePath,
      publicUrl: this.s3Service.getPublicUrlForObjectKey(finalStoragePath),
      contentType,
      urls,
    };
  }

  async completeRecordingUpload(
    userId: string,
    rolePlayId: string,
    sessionId: string,
    uploadId: string,
    storagePath: string,
    parts: CompletedRecordingPartDto[],
  ): Promise<{
    storagePath: string;
    publicUrl: string;
    location?: string;
    savedReport: ReportDocument;
  }> {
    await this.getOwnedSession(userId, sessionId, rolePlayId);
    this.assertRecordingStoragePath(storagePath, userId, rolePlayId, sessionId);

    const uniquePartNumbers = new Set(parts.map((part) => part.partNumber));
    if (uniquePartNumbers.size !== parts.length) {
      throw new BadRequestException(
        'Duplicate partNumber values are not allowed',
      );
    }

    const completed = await this.s3Service.completeMultipartUpload({
      key: storagePath,
      uploadId,
      parts,
    });

    const publicUrl = this.s3Service.getPublicUrlForObjectKey(completed.key);

    const sessionObjectId = new Types.ObjectId(sessionId);
    const userObjectId = new Types.ObjectId(userId);

    const savedReport = await this.reportModel
      .findOneAndUpdate(
        { sessionId: sessionObjectId },
        {
          $set: { recordingUrl: publicUrl },
          $setOnInsert: {
            sessionId: sessionObjectId,
            userId: userObjectId,
            status: ReportStatus.GENERATING,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();
    // Mark the session as completed
    await this.rolePlaySessionModel
      .updateOne(
        { _id: new Types.ObjectId(sessionId) },
        {
          $set: {
            status: RolePlaySessionStatus.COMPLETED,
            recordingUrl: publicUrl,
          },
        },
      )
      .exec();

    return {
      storagePath: completed.key,
      publicUrl,
      location: completed.location,
      savedReport,
    };
  }

  async abortRecordingUpload(
    userId: string,
    rolePlayId: string,
    sessionId: string,
    uploadId: string,
    storagePath: string,
  ): Promise<{ aborted: true; storagePath: string }> {
    await this.getOwnedSession(userId, sessionId, rolePlayId);
    this.assertRecordingStoragePath(storagePath, userId, rolePlayId, sessionId);

    await this.s3Service.abortMultipartUpload(storagePath, uploadId);
    return { aborted: true, storagePath };
  }

  /**
   * POST /recording/speech-to-text
   * Transcribes an uploaded audio file, then stores the transcript as a USER turn.
   */
  async transcribeAndSave(
    userId: string,
    audioBuffer: Buffer,
    rolePlayId: string,
    sessionId: string,
    mimeType = 'audio/webm',
    originalName = 'recording.webm',
  ): Promise<{ text: string; sequence: number; turnId: string }> {
    const session = await this.getOwnedSession(userId, sessionId, rolePlayId);
    if (!audioBuffer?.length) {
      throw new BadRequestException('Provide a non-empty audio recording.');
    }

    this.assertOpenAIConfigured();
    const audioFile = await toFile(audioBuffer, originalName, {
      type: mimeType,
    });
    const transcription = await this.openai.audio.transcriptions.create({
      file: audioFile,
      model: 'gpt-4o-mini-transcribe',
      // Optional: set language: 'en' when the app only supports English.
    });
    const transcriptText = transcription.text.trim();

    if (!transcriptText) {
      throw new BadRequestException('Audio transcription returned empty text.');
    }

    const sequence = await this.nextSequenceForSession(session._id);
    const created = await this.conversationModel.create({
      sessionId: session._id,
      speaker: ConversationSpeaker.USER,
      sequence,
      text: transcriptText,
      wordCount: transcriptText.split(/\s+/).filter(Boolean).length,
    } as Partial<ConversationTurn>);

    return {
      text: transcriptText,
      sequence: created.sequence,
      turnId: String(created._id),
    };
  }

  /**
   * POST /recording/generate-report
   * Evaluates the full transcript and upserts one Report and one ReportFeedback per session.
   */
  async generateSessionReport(
    userId: string,
    sessionId: string,
  ): Promise<{ report: ReportDocument; feedback: ReportFeedbackDocument }> {
    this.assertOpenAIConfigured();
    if (!Types.ObjectId.isValid(sessionId))
      throw new BadRequestException('Invalid session id');

    const session = await this.getOwnedSession(userId, sessionId);
    const rolePlay = await this.rolePlayModel
      .findById(session.rolePlayId)
      .exec();
    if (!rolePlay)
      throw new BadRequestException('Roleplay not found for this session');

    const turns = await this.conversationModel
      .find({ sessionId: session._id })
      .sort({ sequence: 1 })
      .lean()
      .exec();
    const userTurns = turns.filter(
      (turn) => turn.speaker === ConversationSpeaker.USER,
    );
    if (!turns.length || !userTurns.length) {
      throw new BadRequestException(
        'At least one user answer is required to generate a report',
      );
    }

    const transcript = turns
      .map(
        (turn) =>
          `${turn.speaker === ConversationSpeaker.AI ? 'AI' : 'User'}: ${turn.text}`,
      )
      .join('\n');

    let analysis: any;
    try {
      const { getReportAnalysisSchema } =
        await import('../zod/report-analysis.schema.js');
      const schema = await getReportAnalysisSchema();
      const reportAgent = new Agent({
        name: 'Communication Skills Report Evaluator',
        model: 'gpt-4o-mini',
        instructions: [
          'Evaluate a communication roleplay based only on the supplied transcript and scenario.',
          'Give evidence-based scores from 0 to 5. Do not invent details not present in the transcript.',
          'Assess active listening, conciseness, and STAR (situation, task, action, result).',
          'Return all required fields in the provided structured output schema.',
        ].join(' '),
        outputType: schema as any,
      });
      const result = await run(
        reportAgent,
        JSON.stringify({
          roleplay: {
            title: rolePlay.title,
            description: rolePlay.description,
            objectives: rolePlay.objectives,
            systemPrompt: rolePlay.systemPrompt,
          },
          transcript,
        }),
      );
      analysis = result.finalOutput;
      if (typeof analysis === 'string') analysis = JSON.parse(analysis);
      if (!analysis || typeof analysis !== 'object')
        throw new Error('Empty structured report output');
    } catch (error) {
      this.logger.error(
        'Report agent failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        'Could not generate the report. Please try again.',
      );
    }

    const existingReport = await this.reportModel
      .findOne({ sessionId: session._id })
      .select({ recordingUrl: 1 })
      .lean()
      .exec();
    const recordingUrl = existingReport?.recordingUrl ?? session.recordingUrl;
    const reportUpdate: Partial<Report> = {
      sessionId: session._id,
      userId: new Types.ObjectId(String(session.userId)),
      status: ReportStatus.COMPLETED,
      overallScore: analysis.overallScore,
      summary: analysis.summary,
      model: 'gpt-4o-mini',
      promptVersion: 'communication-report-agent-v1',
    };
    if (recordingUrl) {
      reportUpdate.recordingUrl = recordingUrl;
    }

    const report = await this.reportModel
      .findOneAndUpdate(
        { sessionId: session._id },
        {
          $set: reportUpdate,
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();

    const feedback = await this.reportFeedbackModel
      .findOneAndUpdate(
        { reportId: report._id },
        {
          $set: {
            reportId: report._id,
            activeListening: analysis.activeListening,
            star: analysis.star,
            strengths: analysis.strengths ?? [],
            growthPoints: analysis.growthPoints ?? [],
            tones: analysis.tones ?? [],
            conciseness: analysis.conciseness,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();

    return { report, feedback };
  }
}
