import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RolePlaySessionDocument = HydratedDocument<RolePlaySession>;

export enum RolePlaySessionStatus {
  CREATED = 'created',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Schema({
  timestamps: true,
  collection: 'roleplay_sessions',
})
export class RolePlaySession {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'RolePlay',
    required: true,
    index: true,
  })
  rolePlayId!: Types.ObjectId;

  @Prop({
    enum: Object.values(RolePlaySessionStatus),
    default: RolePlaySessionStatus.CREATED,
    index: true,
  })
  status!: RolePlaySessionStatus;

  @Prop()
  startedAt?: Date;

  @Prop()
  endedAt?: Date;

  @Prop()
  durationSeconds?: number;
}

export const RolePlaySessionSchema =
  SchemaFactory.createForClass(RolePlaySession);
