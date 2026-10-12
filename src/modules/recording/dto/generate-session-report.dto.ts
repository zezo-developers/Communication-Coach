import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class GenerateSessionReportDto {
  @ApiProperty({
    description: 'Session id for which to generate a report from the full conversation history.',
    example: '66d1d5f1d8d3070019e8f8c9',
  })
  @IsMongoId({ message: 'sessionId must be a valid Mongo ObjectId' })
  sessionId!: string;
}
