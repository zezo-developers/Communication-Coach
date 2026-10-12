import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class SpeechToTextDto {
  @ApiProperty({
    description: 'Roleplay id',
    example: '6accc2074f59dd54ee0591ef',
  })
  @IsMongoId()
  rolePlayId!: string;

  @ApiProperty({
    description: 'Session id to attach the transcription to',
    example: '6accc2254f59dd54ee0591f0',
  })
  @IsMongoId()
  sessionId!: string;
}
