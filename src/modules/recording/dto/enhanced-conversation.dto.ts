import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class EnhancedConversationDto {
  @ApiProperty({
    description:
      'MongoDB id of the user answer to enhance. The answer must belong to your session and have a preceding AI question.',
    example: '6accc2074f59dd54ee0591ef',
  })
  @IsMongoId()
  conversationTurnId!: string;
}
