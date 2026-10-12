import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { RolePlay, RolePlayDocument } from '@/database/schemas/rolePlay.schema';
import {
  RolePlaySession,
  RolePlaySessionDocument,
  RolePlaySessionStatus,
} from '@/database/schemas/rolePlaySession.schema';
import { RecordingService } from '@/modules/recording/services/recording.service';

export interface InitialRecordingUpload {
  uploadId: string;
  storagePath: string;
  publicUrl: string;
  contentType: string;
  urls: Array<{ partNumber: number; uploadUrl: string; expiresAt: Date }>;
}

export interface CreateRolePlaySessionResult {
  session: RolePlaySessionDocument;
  recordingUpload: InitialRecordingUpload;
}

@Injectable()
export class RoleplalySessionService {
  constructor(
    @InjectModel(RolePlay.name)
    private readonly rolePlayModel: Model<RolePlayDocument>,
    @InjectModel(RolePlaySession.name)
    private readonly rolePlaySessionModel: Model<RolePlaySessionDocument>,

    private readonly recordingService: RecordingService,
  ) {}

  async createSession(
    authenticatedUserId: string,
    rolePlayId: string,
  ): Promise<CreateRolePlaySessionResult> {
    if (!isValidObjectId(authenticatedUserId)) {
      throw new BadRequestException('Invalid authenticated user id');
    }

    if (!isValidObjectId(rolePlayId)) {
      throw new BadRequestException('Invalid roleplay id');
    }

    const rolePlay = await this.rolePlayModel.findById(rolePlayId).exec();
    if (!rolePlay) {
      throw new NotFoundException(`Roleplay with id ${rolePlayId} not found`);
    }

    if (rolePlay.isActive === false) {
      throw new BadRequestException(
        'This roleplay is currently inactive and cannot start a session',
      );
    }

    const pendingStatuses = [
      RolePlaySessionStatus.CREATED,
      RolePlaySessionStatus.IN_PROGRESS,
    ];

    const previousPendingSessions = await this.rolePlaySessionModel
      .find({
        userId: authenticatedUserId,
        rolePlayId,
        status: { $in: pendingStatuses },
      })
      .exec();

    if (previousPendingSessions.length > 0) {
      const previousSessionIds = previousPendingSessions.map(
        (session) => session._id,
      );

      await this.rolePlaySessionModel.updateMany(
        {
          _id: { $in: previousSessionIds },
          status: { $in: pendingStatuses },
        },
        {
          $set: {
            status: RolePlaySessionStatus.FAILED,
            endedAt: new Date(),
          },
        },
      );
    }

    const session = await this.rolePlaySessionModel.create({
      userId: authenticatedUserId,
      rolePlayId,
      status: RolePlaySessionStatus.CREATED,
      startedAt: new Date(),
    });

    if (!session) {
      throw new BadRequestException('Failed to create a new roleplay session');
    }

    const recordingUpload =
      await this.recordingService.createRecordingUploadBatch(
        authenticatedUserId,
        rolePlayId,
        session._id.toString(),
        1,
        10,
      );

    return {
      session,
      recordingUpload,
    };
  }
}
