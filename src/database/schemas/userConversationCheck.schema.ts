import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserConversationCheckDocument =
  HydratedDocument<UserConversationCheck>;

export enum UserConversationCheckStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum UserConversationLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum ConversationMessageRole {
  USER = 'user',
  AI = 'ai',
}

@Schema({ _id: false })
export class ConversationMessage {
  @Prop({
    required: true,
    enum: Object.values(ConversationMessageRole),
  })
  role!: ConversationMessageRole;

  @Prop({ required: true, trim: true })
  message!: string;
}

const ConversationMessageSchema =
  SchemaFactory.createForClass(ConversationMessage);

@Schema({ _id: false })
export class UserConversationScores {
  @Prop({ required: true, min: 0, max: 5 })
  sentenceFraming!: number;

  @Prop({ required: true, min: 0, max: 5 })
  vocabulary!: number;

  @Prop({ required: true, min: 0, max: 5 })
  grammar!: number;

  @Prop({ required: true, min: 0, max: 5 })
  fluency!: number;

  @Prop({ required: true, min: 0, max: 5 })
  coherence!: number;

  @Prop({ required: true, min: 0, max: 5 })
  confidence!: number;
}

const UserConversationScoresSchema = SchemaFactory.createForClass(
  UserConversationScores,
);

@Schema({
  timestamps: true,
  collection: 'user_conversation_checks',
})
export class UserConversationCheck {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    enum: Object.values(UserConversationCheckStatus),
    default: UserConversationCheckStatus.PENDING,
    index: true,
  })
  status!: UserConversationCheckStatus;

  @Prop({
    type: [ConversationMessageSchema],
    default: [],
  })
  lastConversation!: ConversationMessage[];

  @Prop({ type: UserConversationScoresSchema })
  scores?: UserConversationScores;

  @Prop({ min: 0, max: 5 })
  overallScore?: number;

  @Prop({ min: 1, default: 1 })
  reCheckConversatonAt?: number;

  @Prop({ enum: Object.values(UserConversationLevel) })
  level?: UserConversationLevel;

  @Prop({
    type: [String],
    default: [],
  })
  strengths!: string[];

  @Prop({
    type: [String],
    default: [],
  })
  improvements!: string[];

  @Prop()
  assessedAt?: Date;
}

export const UserConversationCheckSchema = SchemaFactory.createForClass(
  UserConversationCheck,
);
