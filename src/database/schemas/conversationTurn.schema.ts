import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationTurnDocument = HydratedDocument<ConversationTurn>;

export enum ConversationSpeaker {
  USER = 'user',
  AI = 'ai',
}

@Schema({ _id: false })
export class VocabularyItem {
  @Prop({
    required: true,
  })
  word!: string;

  @Prop({
    required: true,
  })
  meaning!: string;

  @Prop({
    required: true,
  })
  exampleWordInSentence!: string;
}

@Schema({ _id: false })
export class EnhancedConversationTurn {
  @Prop({
    required: true,
  })
  naturalSentence!: string;

  @Prop({
    type: [VocabularyItem],
    required: true,
  })
  vocabularyItems!: VocabularyItem[];
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

  @Prop({
    type: EnhancedConversationTurn,
  })
  enhancedTurn?: EnhancedConversationTurn;
}

export const ConversationTurnSchema =
  SchemaFactory.createForClass(ConversationTurn);
