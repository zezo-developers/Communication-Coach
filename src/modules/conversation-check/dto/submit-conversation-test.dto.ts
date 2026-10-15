import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConversationMessageRole } from '@/database/schemas/userConversationCheck.schema';

export class SubmitConversationMessageDto {
  @ApiProperty({ enum: ConversationMessageRole, example: 'user' })
  @IsEnum(ConversationMessageRole)
  role!: ConversationMessageRole;

  @ApiProperty({ example: 'I usually spend my weekends reading and cooking.' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}

export class SubmitConversationTestDto {
  @ApiProperty({
    type: [SubmitConversationMessageDto],
    example: [
      { role: 'ai', message: 'What do you enjoy doing in your free time?' },
      {
        role: 'user',
        message: 'I usually spend my weekends reading and cooking.',
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitConversationMessageDto)
  conversation!: SubmitConversationMessageDto[];
}
