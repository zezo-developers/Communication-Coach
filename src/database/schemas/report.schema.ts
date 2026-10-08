import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReportDocument = HydratedDocument<Report>;

export enum ReportStatus {
  GENERATING = 'generating',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({
  timestamps: true,
  collection: 'reports',
})
export class Report {
  @Prop({
    type: Types.ObjectId,
    ref: 'RolePlaySession',
    required: true,
    unique: true,
    index: true,
  })
  sessionId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    enum: Object.values(ReportStatus),
    default: ReportStatus.GENERATING,
    index: true,
  })
  status!: ReportStatus;

  @Prop({
    min: 0,
    max: 5,
  })
  overallScore?: number;

  @Prop()
  summary?: string;

  @Prop()
  model?: string;

  @Prop()
  promptVersion?: string;

  @Prop()
  generatedAt?: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
