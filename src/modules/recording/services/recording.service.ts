import {
  BadRequestException,
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GoogleGenAI } from '@google/genai';
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
import {
  UserConversationCheck,
  UserConversationCheckDocument,
} from '@/database/schemas/userConversationCheck.schema';
import {
  configureDigitalOceanAgent,
  getDigitalOceanBaseURL,
} from '@/common/ai/digitalocean-agent.config';
import { PronunciationQueueService } from '@/queues/services/pronunciation.queue.service';
import { EnhancedConversationDto } from '../dto/enhanced-conversation.dto';
import { getReportAnalysisSchema } from '../zod/report-analysis.schema';
import { getEnhancedConversationSchema } from '../zod/enhanced-conversation.schema';

@Injectable()
export class RecordingService {
  private readonly logger = new Logger(RecordingService.name);

  constructor(
    @InjectModel(ConversationTurn.name)
    private readonly conversationModel: Model<ConversationTurnDocument>,
    @InjectModel(UserConversationCheck.name)
    private readonly userConversationCheckModel: Model<UserConversationCheckDocument>,
    @InjectModel(RolePlay.name)
    private readonly rolePlayModel: Model<RolePlayDocument>,
    @InjectModel(RolePlaySession.name)
    private readonly rolePlaySessionModel: Model<RolePlaySessionDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(ReportFeedback.name)
    private readonly reportFeedbackModel: Model<ReportFeedbackDocument>,
    private readonly s3Service: S3Service,
    private readonly pronunciationQueueService: PronunciationQueueService,
  ) {}

  private configureDigitalOcean(): string {
    try {
      return configureDigitalOceanAgent();
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error
          ? error.message
          : 'DigitalOcean AI is not configured on the server',
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
    const configuredVoice = requestedVoice || config.voice;
    return {
      voice: String(
        configuredVoice === 'nova' ? 'alloy' : configuredVoice || 'alloy',
      ),
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

  /** Generates MP3 audio through DigitalOcean's audio inference endpoint. */
  private async generateAudioDataUrl(
    text: string,
    voice: string,
    language: string,
    style: string,
  ): Promise<string> {
    this.configureDigitalOcean();
    const apiKey = process.env.DIGITALOCEAN_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'DIGITALOCEAN_API_KEY is not configured',
      );
    }

    const baseUrl = getDigitalOceanBaseURL().replace(/\/+$/, '');
    const apiBaseUrl = /\/v1$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
    const response = await fetch(`${apiBaseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg, application/json',
      },
      body: JSON.stringify({
        model: process.env.DIGITALOCEAN_TTS_MODEL || 'qwen3-tts-voicedesign',
        input: text,
        voice,
        response_format: 'mp3',
        instructions: `Speak naturally and clearly in ${language} with a ${style} tone.`,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const contentType = response.headers.get('content-type') || '';
    const responseBytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      const errorBody = responseBytes.toString('utf8').slice(0, 1000);
      throw new Error(
        `DigitalOcean TTS request failed (${response.status}): ${errorBody}`,
      );
    }
    if (!responseBytes.length) {
      throw new Error('DigitalOcean TTS returned an empty response');
    }

    let audioBytes: Buffer | undefined;
    if (contentType.includes('application/json')) {
      let payload: unknown;
      try {
        payload = JSON.parse(responseBytes.toString('utf8'));
      } catch {
        throw new Error('DigitalOcean TTS returned invalid JSON');
      }

      if (typeof payload === 'string') {
        audioBytes = this.decodeBase64Audio(payload);
      } else if (
        payload &&
        typeof payload === 'object' &&
        'data' in payload &&
        Array.isArray(payload.data)
      ) {
        const firstResult = payload.data[0];
        if (
          firstResult &&
          typeof firstResult === 'object' &&
          'b64_json' in firstResult &&
          typeof firstResult.b64_json === 'string'
        ) {
          audioBytes = this.decodeBase64Audio(firstResult.b64_json);
        }
      }
    } else if (
      contentType.startsWith('audio/') ||
      contentType.includes('application/octet-stream')
    ) {
      audioBytes = responseBytes;
    } else {
      audioBytes = this.decodeBase64Audio(responseBytes.toString('utf8'));
    }

    if (!audioBytes?.length) {
      throw new Error(
        'DigitalOcean TTS returned an unexpected response format',
      );
    }

    const bytes = audioBytes;
    return `data:audio/mpeg;base64,${bytes.toString('base64')}`;
  }

  private decodeBase64Audio(value: string): Buffer | undefined {
    const base64 = value.trim();
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      return undefined;
    }

    const bytes = Buffer.from(base64, 'base64');
    return bytes.length ? bytes : undefined;
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
    const model = this.configureDigitalOcean();
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

    const userConversationCheck = await this.userConversationCheckModel.findOne(
      {
        userId: new Types.ObjectId(userId),
      },
    );

    let userConversationScroe = userConversationCheck?.scores;

    if (!userConversationScroe) {
      userConversationScroe = {
        sentenceFraming: 0,
        vocabulary: 0,
        grammar: 0,
        fluency: 0,
        coherence: 0,
        confidence: 0,
      };
    }

    const questionAgent = new Agent({
      name: 'Communication Roleplay Interviewer',
      model,

      instructions: [
        'You are a realistic spoken communication roleplay interviewer.',
        'You must strictly remain in the assigned roleplay scenario and act according to the provided AI persona at all times.',
        'Use the roleplay scenario, objectives, persona, difficulty, complete conversation history, and user communication profile to guide your responses.',

        'The user communication profile contains baseline English communication scores from a previous assessment. Scores range from 0 to 5, where lower scores indicate areas that may need improvement and higher scores indicate stronger skills.',
        'The profile includes sentenceFraming, vocabulary, grammar, fluency, coherence, and confidence.',

        'Use the baseline scores internally to choose questions that naturally encourage the user to demonstrate their current communication abilities and reveal opportunities for improvement.',
        'If sentence framing is weak, ask questions that encourage the user to explain ideas, describe experiences, or express opinions in complete sentences.',
        'If vocabulary is weak, ask questions that encourage the user to describe things, compare options, explain preferences, or discuss experiences using varied words.',
        'If grammar is weak, ask natural questions that encourage the user to explain events, plans, reasons, or hypothetical situations using different sentence structures.',
        'If fluency or confidence is weak, ask approachable, conversational questions that encourage the user to speak comfortably and elaborate without feeling tested.',
        'If coherence is weak, ask questions that encourage the user to explain reasons, describe sequences of events, or connect ideas logically.',
        'When multiple aspects need improvement, choose a question that naturally creates an opportunity to observe more than one aspect.',
        'For stronger aspects, gradually introduce more nuanced questions that encourage detailed explanations, reasoning, and natural expression without abruptly increasing difficulty.',

        'These scores represent the user’s current baseline, not their permanent ability. Do not assume the user will perform at exactly the same level in every response.',
        'Never mention the scores, assessment, English proficiency analysis, or improvement strategy to the user.',
        'Never explicitly test grammar, vocabulary, pronunciation, fluency, or confidence. Do not ask the user to correct sentences, define words, or perform language exercises.',
        'Every question must make sense within the roleplay situation and sound like something the assigned persona would genuinely ask.',
        'Do not sacrifice roleplay realism merely to assess a communication skill. If an assessment opportunity conflicts with the scenario, prioritize the scenario.',

        'Ask exactly ONE natural follow-up question per response.',
        'Respond to the latest user answer and move the scenario forward.',
        'Do not repeat a question already asked.',
        'If there are no prior turns, ask a relevant opening question.',
        'Return only the question itself. Do not include labels, explanations, markdown, feedback, or multiple questions.',
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
      userCommunicationProfile: {
        sentenceFraming: userConversationScroe.sentenceFraming,
        vocabulary: userConversationScroe.vocabulary,
        grammar: userConversationScroe.grammar,
        fluency: userConversationScroe.fluency,
        coherence: userConversationScroe.coherence,
        confidence: userConversationScroe.confidence,
      },
      conversation,
    });

    const agentResult = await run(questionAgent, prompt);
    const questionText = String(agentResult.finalOutput ?? '')
      .trim()
      .replace(/^['"\s]+|['"\s]+$/g, '');
    if (!questionText)
      throw new InternalServerErrorException(
        'DigitalOcean AI did not return a question',
      );

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
        'Audio generation failed. Please try again later.',
      );
    }

    const sequence = await this.nextSequenceForSession(session._id);
    const created = await this.conversationModel.create({
      sessionId: session._id,
      speaker: ConversationSpeaker.AI,
      sequence,
      text: questionText,
    } as Partial<ConversationTurn>);

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
    if (audioBuffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException(
        'Google Gemini accepts inline audio up to 10 MB.',
      );
    }

    const apiKey = process.env.GOOGLE_GEMINI_API;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'Google Gemini is not configured on the server.',
      );
    }

    let transcriptText: string;
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: audioBuffer.toString('base64'),
                },
              },
              { text: 'Transcribe the audio and return only the transcript.' },
            ],
          },
        ],
      });
      const responseParts =
        response.candidates?.flatMap(
          (candidate) => candidate.content?.parts ?? [],
        ) ?? [];
      const audioTranscript = responseParts
        .map((part) => part.audioTranscription?.text)
        .filter((text): text is string => Boolean(text?.trim()))
        .join(' ')
        .trim();
      transcriptText =
        audioTranscript ||
        responseParts
          .map((part) => part.text ?? '')
          .filter(Boolean)
          .join(' ')
          .trim();
    } catch (error) {
      this.logger.error(
        'Google Gemini transcription failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        'Audio transcription failed. Please try again later.',
      );
    }

    if (!transcriptText) {
      throw new BadRequestException(
        'Google Gemini did not recognize any speech in the audio.',
      );
    }

    const sequence = await this.nextSequenceForSession(session._id);
    const created = await this.conversationModel.create({
      sessionId: session._id,
      speaker: ConversationSpeaker.USER,
      sequence,
      text: transcriptText,
      wordCount: transcriptText.split(/\s+/).filter(Boolean).length,
    } as Partial<ConversationTurn>);

    await this.pronunciationQueueService.analyzeTurn({
      sessionId: String(session._id),
      userId: String(session.userId),
      turnId: String(created._id),
      transcript: transcriptText,
      audioBase64: audioBuffer.toString('base64'),
      audioMimeType: mimeType,
      audioFileName: originalName,
    });

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
    const model = this.configureDigitalOcean();
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

    const userConversationCheck = await this.userConversationCheckModel.findOne(
      {
        userId: new Types.ObjectId(userId),
      },
    );

    let userConversationScroe = userConversationCheck?.scores;

    if (!userConversationScroe) {
      userConversationScroe = {
        sentenceFraming: 0,
        vocabulary: 0,
        grammar: 0,
        fluency: 0,
        coherence: 0,
        confidence: 0,
      };
    }

    let analysis: any;
    try {
      const schema = await getReportAnalysisSchema();
      const reportAgent = new Agent({
        name: 'Communication Skills Report Evaluator',
        model,
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
      model,
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

  /**
   * POST /recording/enhanced-conversation
   * Generates and saves a natural rewrite and vocabulary suggestions for a user turn.
   */
  async enhancedConversation(userId: string, dto: EnhancedConversationDto) {
    if (!Types.ObjectId.isValid(dto.conversationTurnId)) {
      throw new BadRequestException('Invalid conversation turn id');
    }

    const userTurn = await this.conversationModel
      .findById(new Types.ObjectId(dto.conversationTurnId))
      .exec();
    if (!userTurn) {
      throw new BadRequestException('Conversation turn not found');
    }
    if (userTurn.speaker !== ConversationSpeaker.USER) {
      throw new BadRequestException(
        'Only user conversation turns can be enhanced',
      );
    }

    const session = await this.getOwnedSession(
      userId,
      String(userTurn.sessionId),
    );
    const previousAiTurn = await this.conversationModel
      .findOne({
        sessionId: session._id,
        speaker: ConversationSpeaker.AI,
        sequence: { $lt: userTurn.sequence },
      })
      .sort({ sequence: -1, createdAt: -1 })
      .lean()
      .exec();
    if (!previousAiTurn) {
      throw new BadRequestException(
        'No preceding AI question was found for this user turn',
      );
    }

    const model = this.configureDigitalOcean();
    let enhancedTurn: ReturnType<
      Awaited<ReturnType<typeof getEnhancedConversationSchema>>['parse']
    >;
    try {
      const schema = await getEnhancedConversationSchema();
      const enhancementAgent = new Agent({
        name: 'User Conversation Enhancer',
        model,
        instructions: [
          'You are a supportive English communication coach helping a learner improve one answer in a roleplay conversation.',
          'Use the previous AI question only to understand what the learner was responding to. Rewrite only the supplied user answer.',
          'I want you to strictly do not change the user sentence, just rewrite how a natural  native speaker would say this same sentence.',
          'Suggest a small number of useful vocabulary alternatives only when they genuinely help the learner express the same idea more naturally or precisely. It is acceptable to return an empty vocabularyItems array.',
          'For each vocabulary item, provide the word or phrase, a simple learner-friendly meaning, and an exampleWordInSentence showing how to use it in the enhanced sentence or a natural variation of it.',
          'Return all required fields in the provided structured output schema.',
        ].join(' '),
        outputType: schema,
      });
      const result = await run(
        enhancementAgent,
        JSON.stringify({
          previousAiQuestion: previousAiTurn.text,
          userAnswer: userTurn.text,
          requirements: {
            preserveOriginalMeaning: true,
            naturalSentence:
              'Native-sounding English in response to the question',
            vocabularyItems:
              'Optional useful vocabulary with simple meanings and contextual examples',
          },
        }),
      );
      const output =
        typeof result.finalOutput === 'string'
          ? JSON.parse(result.finalOutput)
          : result.finalOutput;
      enhancedTurn = schema.parse(output);
    } catch (error) {
      this.logger.error(
        'Enhanced conversation agent failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        'Could not enhance the conversation. Please try again.',
      );
    }

    const updatedTurn = await this.conversationModel
      .findOneAndUpdate(
        {
          _id: userTurn._id,
          sessionId: session._id,
          speaker: ConversationSpeaker.USER,
        },
        { $set: { enhancedTurn } },
        { new: true, runValidators: true },
      )
      .exec();
    if (!updatedTurn) {
      throw new BadRequestException('Conversation turn could not be updated');
    }

    return {
      conversationTurnId: String(updatedTurn._id),
      previousAiQuestion: previousAiTurn.text,
      originalSentence: updatedTurn.text,
      enhancedTurn: updatedTurn.enhancedTurn,
    };
  }
}
