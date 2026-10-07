import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum OtpType {
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
}

@Schema({ timestamps: true })
export class Otp extends Document {
  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  otp!: string;

  @Prop({ required: true, enum: OtpType })
  type!: OtpType;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: 0 })
  attempts!: number;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

// TTL index: auto-delete expired OTPs after 10 minutes
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpSchema.index({ email: 1, type: 1 });