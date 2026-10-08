import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RecordingDocument = HydratedDocument<Recording>;

export enum RecordingStatus {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({
  timestamps: true,
  collection: 'recordings',
})
export class Recording {
  @Prop({
    type: Types.ObjectId,
    ref: 'RolePlaySession',
    required: true,
    index: true,
  })
  sessionId!: Types.ObjectId;

  @Prop({
    required: true,
  })
  storageKey!: string;

  @Prop()
  storageUrl?: string;

  @Prop({
    required: true,
  })
  mimeType!: string;

  @Prop()
  fileSizeBytes?: number;

  @Prop()
  durationSeconds?: number;

  @Prop({
    enum: Object.values(RecordingStatus),
    default: RecordingStatus.UPLOADING,
  })
  status!: RecordingStatus;

  @Prop({
    enum: Object.values(RecordingStatus),
    default: RecordingStatus.UPLOADING,
  })
  transcriptStatus!: RecordingStatus;
}

export const RecordingSchema = SchemaFactory.createForClass(Recording);
