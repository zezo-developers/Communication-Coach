import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReportFeedbackDocument = HydratedDocument<ReportFeedback>;

@Schema({ _id: false })
export class FeedbackScore {
  @Prop({
    required: true,
    min: 0,
    max: 5,
  })
  score!: number;

  @Prop({
    required: true,
  })
  feedback!: string;
}

const FeedbackScoreSchema = SchemaFactory.createForClass(FeedbackScore);

@Schema({ _id: false })
export class StarSection {
  @Prop({
    type: FeedbackScoreSchema,
    required: true,
  })
  situation!: FeedbackScore;

  @Prop({
    type: FeedbackScoreSchema,
    required: true,
  })
  task!: FeedbackScore;

  @Prop({
    type: FeedbackScoreSchema,
    required: true,
  })
  action!: FeedbackScore;

  @Prop({
    type: FeedbackScoreSchema,
    required: true,
  })
  result!: FeedbackScore;

  @Prop({
    min: 0,
    max: 5,
  })
  overallScore?: number;
}

const StarSectionSchema = SchemaFactory.createForClass(StarSection);

@Schema({
  timestamps: true,
  collection: 'report_feedback',
})
export class ReportFeedback {
  @Prop({
    type: Types.ObjectId,
    ref: 'Report',
    required: true,
    unique: true,
    index: true,
  })
  reportId!: Types.ObjectId;

  @Prop({
    type: FeedbackScoreSchema,
    required: true,
  })
  activeListening!: FeedbackScore;

  @Prop({
    type: StarSectionSchema,
    required: true,
  })
  star!: StarSection;

  @Prop({
    type: [String],
    default: [],
  })
  strengths!: string[];

  @Prop({
    type: [String],
    default: [],
  })
  growthPoints!: string[];

  @Prop({
    type: [String],
    default: [],
  })
  tones!: string[];

  @Prop({
    type: FeedbackScoreSchema,
    required: true,
  })
  conciseness!: FeedbackScore;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const ReportFeedbackSchema =
  SchemaFactory.createForClass(ReportFeedback);
