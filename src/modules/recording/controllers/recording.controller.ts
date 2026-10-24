import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from 'src/modules/auth/strategies/jwt.strategy';
import { CreateTextToSpeechDto } from '../dto/create-text-to-speech.dto';
import { EnhancedConversationDto } from '../dto/enhanced-conversation.dto';
import { GenerateSessionReportDto } from '../dto/generate-session-report.dto';
import { SpeechToTextDto } from '../dto/speech-to-text.dto';
import {
  AbortRecordingDto,
  BatchPresignRecordingDto,
  CompleteRecordingDto,
} from '../dto/recording-upload.dto';
import { RecordingService } from '../services/recording.service';

@ApiTags('Recording')
@Controller('recording')
@UseGuards(JwtAuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@ApiBearerAuth('JWT-auth')
export class RecordingController {
  constructor(private readonly recordingService: RecordingService) {}

  private getAuthenticatedUserId(req: any): string {
    const user = req.user as AuthenticatedUser;
    const userId = String(user?.sub ?? (user as any)?._id ?? '');
    if (!userId) {
      throw new BadRequestException('Authenticated user id is missing');
    }
    return userId;
  }

  @Post('batch-presign-url')
  @ApiOperation({
    summary: 'Create or continue a multipart recording upload',
    description:
      'Returns a batch of presigned S3 URLs for uploading MP3 conversation recording chunks. Omit uploadId and storagePath for the first batch; send them for later batches.',
  })
  @ApiBody({ type: BatchPresignRecordingDto })
  async batchPresignUrl(
    @Req() req: any,
    @Body() dto: BatchPresignRecordingDto,
  ) {
    return this.recordingService.createRecordingUploadBatch(
      this.getAuthenticatedUserId(req),
      dto.rolePlayId,
      dto.sessionId,
      dto.startPartNumber,
      dto.partCount,
      dto.uploadId,
      dto.storagePath,
    );
  }

  @Post('complete-recording')
  @ApiOperation({
    summary: 'Complete a multipart recording upload',
    description:
      'Takes all uploaded part ETags, asks S3 to merge them, and returns the final MP3 recording URL.',
  })
  @ApiBody({ type: CompleteRecordingDto })
  async completeRecording(@Req() req: any, @Body() dto: CompleteRecordingDto) {
    return this.recordingService.completeRecordingUpload(
      this.getAuthenticatedUserId(req),
      dto.rolePlayId,
      dto.sessionId,
      dto.uploadId,
      dto.storagePath,
      dto.parts,
    );
  }

  @Post('abort-recording')
  @ApiOperation({
    summary: 'Abort a multipart recording upload',
    description:
      'Aborts an in-progress S3 multipart upload so uploaded recording chunks are discarded.',
  })
  @ApiBody({ type: AbortRecordingDto })
  async abortRecording(@Req() req: any, @Body() dto: AbortRecordingDto) {
    return this.recordingService.abortRecordingUpload(
      this.getAuthenticatedUserId(req),
      dto.rolePlayId,
      dto.sessionId,
      dto.uploadId,
      dto.storagePath,
    );
  }

  @Post('generate-question')
  @ApiOperation({
    summary: 'Generate the next roleplay question and its audio',
    description:
      'Accepts only rolePlayId and sessionId, saves the generated AI question as a conversation turn, and always returns playable MP3 audio.',
  })
  @ApiBody({ type: CreateTextToSpeechDto })
  async generateQuestion(@Req() req: any, @Body() dto: CreateTextToSpeechDto) {
    return this.recordingService.generateQuestionAndSave(
      this.getAuthenticatedUserId(req),
      dto.rolePlayId,
      dto.sessionId,
    );
  }

  @Post('speech-to-text')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { files: 1, fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['rolePlayId', 'sessionId', 'audio'],
      properties: {
        rolePlayId: {
          type: 'string',
          example: '6accc2074f59dd54ee0591ef',
        },
        sessionId: {
          type: 'string',
          example: '6accc2254f59dd54ee0591f0',
        },
        audio: {
          type: 'string',
          format: 'binary',
          description:
            'Audio file up to 10 MB and 1 minute in duration to convert into text',
        },
      },
      additionalProperties: false,
    },
  })
  @ApiOperation({
    summary: 'Transcribe audio and save the user answer',
    description:
      'Accepts only rolePlayId, sessionId, and an audio file up to 10 MB and 1 minute in duration in the `audio` multipart field, transcribes it with Google Gemini, and saves the result as a user conversation turn.',
  })
  async speechToText(
    @Req() req: any,
    @Body() dto: SpeechToTextDto,
    @UploadedFile() audio?: Express.Multer.File,
  ) {
    if (!audio?.buffer?.length) {
      throw new BadRequestException(
        'Provide an audio upload in the `audio` field.',
      );
    }

    return this.recordingService.transcribeAndSave(
      this.getAuthenticatedUserId(req),
      audio.buffer,
      dto.rolePlayId,
      dto.sessionId,
      audio.mimetype,
      audio.originalname,
    );
  }

  @Post('enhanced-conversation')
  @ApiOperation({
    summary: 'Enhance a user conversation turn',
    description:
      'Rewrites an owned user answer as natural English using the preceding AI question for context, optionally suggests useful vocabulary, and saves the enhancement on the conversation turn.',
  })
  @ApiBody({ type: EnhancedConversationDto })
  async enhanceConversation(
    @Req() req: any,
    @Body() dto: EnhancedConversationDto,
  ) {
    return this.recordingService.enhancedConversation(
      this.getAuthenticatedUserId(req),
      dto,
    );
  }

  @Post('generate-report')
  @ApiOperation({
    summary: 'Generate a communication report and feedback for a session',
    description:
      'Evaluates all AI and user conversation turns, then creates or updates the session Report and its associated ReportFeedback documents.',
  })
  @ApiBody({ type: GenerateSessionReportDto })
  async generateReport(@Req() req: any, @Body() dto: GenerateSessionReportDto) {
    return this.recordingService.generateSessionReport(
      this.getAuthenticatedUserId(req),
      dto.sessionId,
    );
  }
}
