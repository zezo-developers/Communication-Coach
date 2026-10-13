import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConversationTurn,
  ConversationTurnDocument,
} from '@/database/schemas/conversationTurn.schema';
import {
  RolePlaySession,
  RolePlaySessionDocument,
} from '@/database/schemas/rolePlaySession.schema';

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(ConversationTurn.name)
    private readonly conversationModel: Model<ConversationTurnDocument>,
    @InjectModel(RolePlaySession.name)
    private readonly rolePlaySessionModel: Model<RolePlaySessionDocument>,
  ) {}

  async listBySession(userId: string, sessionId: string) {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('Invalid session id');
    }

    const session = await this.rolePlaySessionModel
      .findById(new Types.ObjectId(sessionId))
      .exec();

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (String(session.userId) !== String(userId)) {
      throw new BadRequestException(
        'This session does not belong to the authenticated user',
      );
    }

    return this.conversationModel
      .find({ sessionId: new Types.ObjectId(sessionId) })
      .sort({ sequence: 1, createdAt: 1 })
      .lean()
      .exec();
  }
}
