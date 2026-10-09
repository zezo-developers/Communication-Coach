import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum Role {
  USER = 'user',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

@Schema({ timestamps: true })
export class User extends Document {
  // ===== Basic Info =====
  @Prop({ required: true })
  firstName!: string;

  @Prop({ required: true })
  lastName!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  password!: string;

  @Prop({ required: false })
  avatarUrl?: string;

  // ===== Role & Status =====
  @Prop({ enum: Role, default: Role.USER })
  role!: Role;

  @Prop({ enum: UserStatus, default: UserStatus.PENDING })
  status!: UserStatus;

  @Prop({ default: false })
  emailVerified!: boolean;

  @Prop({ default: false })
  isBlocked!: boolean;

  // Store hashed refresh token (never plain)
  @Prop({ select: false })
  refreshTokenHash?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Text index for admin search
UserSchema.index(
  {
    firstName: 'text',
    lastName: 'text',
    email: 'text',
  },
  {
    weights: {
      email: 8,
      firstName: 5,
      lastName: 5,
    },
  },
);

UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ createdAt: -1 });

// Enable virtuals in JSON output
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// Virtual fullName field
UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});
