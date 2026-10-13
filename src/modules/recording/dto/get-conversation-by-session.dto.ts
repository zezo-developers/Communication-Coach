import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class GetConversationBySessionDto {
  @ApiProperty({
    description: 'Session id to list all associated conversation turns',
    example: '66d1d5f1d8d3070019e8f8c9',
  })
  @IsMongoId({ message: 'sessionId must be a valid Mongo ObjectId' })
  sessionId!: string;
}
