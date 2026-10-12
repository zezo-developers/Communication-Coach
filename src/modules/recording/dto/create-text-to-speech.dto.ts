import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class CreateTextToSpeechDto {
  @ApiProperty({
    description: 'Roleplay id to base the generated question on',
    example: '6accc2074f59dd54ee0591ef',
  })
  @IsMongoId()
  rolePlayId!: string;

  @ApiProperty({
    description: 'Session id to attach the generated question to',
    example: '6accc2254f59dd54ee0591f0',
  })
  @IsMongoId()
  sessionId!: string;
}
