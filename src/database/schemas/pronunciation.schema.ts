import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PronunciationDocument = HydratedDocument<Pronunciation>;

@Schema({
  timestamps: true,
  collection: 'pronunciations',
})
export class Pronunciation {
  @Prop({
    type: Types.ObjectId,
    ref: 'Report',
    required: true,
    index: true,
  })
  reportId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'ConversationTurn',
  })
  turnId?: Types.ObjectId;

  @Prop({
    required: true,
  })
  original!: string;

  @Prop({
    required: true,
  })
  corrected!: string;

  @Prop()
  pronunciation?: string;

  @Prop()
  explanation?: string;

  @Prop()
  startTimeSec?: number;

  @Prop()
  endTimeSec?: number;
}

export const PronunciationSchema = SchemaFactory.createForClass(Pronunciation);
