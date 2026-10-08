import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RolePlayDocument = HydratedDocument<RolePlay>;

export enum RolePlayDifficulty {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

@Schema({ _id: false })
export class RolePlayPersona {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  role!: string;

  @Prop()
  personality?: string;
}

const RolePlayPersonaSchema = SchemaFactory.createForClass(RolePlayPersona);

@Schema({
  timestamps: true,
  collection: 'roleplays',
})
export class RolePlay {
  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  title!: string;

  @Prop({
    required: true,
  })
  description!: string;

  @Prop({
    required: true,
    index: true,
  })
  category!: string;

  @Prop({
    enum: Object.values(RolePlayDifficulty),
    default: RolePlayDifficulty.INTERMEDIATE,
  })
  difficulty!: RolePlayDifficulty;

  @Prop({
    required: true,
  })
  systemPrompt!: string;

  @Prop({
    type: RolePlayPersonaSchema,
    required: true,
  })
  aiPersona!: RolePlayPersona;

  @Prop({
    type: [String],
    default: [],
  })
  objectives!: string[];

  @Prop({
    default: true,
    index: true,
  })
  isActive!: boolean;
}

export const RolePlaySchema = SchemaFactory.createForClass(RolePlay);
