import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PronunciationDocument = HydratedDocument<Pronunciation>;

@Schema({ _id: false })
export class PronunciationError {
  @Prop({ required: true, min: 0 })
  position!: number;

  @Prop({ required: true })
  word!: string;

  @Prop({ required: true })
  expected!: string;

  @Prop({ required: true })
  actual!: string;

  @Prop({ required: true, min: 0, max: 1 })
  confidence!: number;

  @Prop({ required: true })
  explanation!: string;
}

export const PronunciationErrorSchema =
  SchemaFactory.createForClass(PronunciationError);

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
    index: true,
  })
  turnId?: Types.ObjectId;

  @Prop({ required: true })
  transcript!: string;

  @Prop({ required: true })
  language!: string;

  @Prop({ required: true })
  feedback!: string;

  @Prop({
    type: [PronunciationErrorSchema],
    default: [],
  })
  errors!: PronunciationError[];
}

export const PronunciationSchema = SchemaFactory.createForClass(Pronunciation);
