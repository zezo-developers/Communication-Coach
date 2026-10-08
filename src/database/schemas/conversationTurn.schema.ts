import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationTurnDocument = HydratedDocument<ConversationTurn>;

export enum ConversationSpeaker {
  USER = 'user',
  AI = 'ai',
}

@Schema({
  timestamps: true,
  collection: 'conversation_turns',
})
export class ConversationTurn {
  @Prop({
    type: Types.ObjectId,
    ref: 'RolePlaySession',
    required: true,
    index: true,
  })
  sessionId!: Types.ObjectId;

  @Prop({
    enum: Object.values(ConversationSpeaker),
    required: true,
  })
  speaker!: ConversationSpeaker;

  @Prop({
    required: true,
  })
  sequence!: number;

  @Prop({
    required: true,
  })
  text!: string;

  @Prop()
  startTimeSec?: number;

  @Prop()
  endTimeMsSec?: number;

  @Prop()
  durationSec?: number;

  @Prop()
  wordCount?: number;
}

export const ConversationTurnSchema =
  SchemaFactory.createForClass(ConversationTurn);
