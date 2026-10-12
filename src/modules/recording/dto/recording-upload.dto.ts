import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BatchPresignRecordingDto {
  @ApiProperty({
    description: 'Roleplay id for the recorded conversation',
    example: '6accc2074f59dd54ee0591ef',
  })
  @IsMongoId()
  rolePlayId!: string;

  @ApiProperty({
    description: 'Session id for the recorded conversation',
    example: '6accc2254f59dd54ee0591f0',
  })
  @IsMongoId()
  sessionId!: string;

  @ApiPropertyOptional({
    description:
      'Existing multipart upload id. Omit it only for the first batch.',
  })
  @IsOptional()
  @IsString()
  uploadId?: string;

  @ApiPropertyOptional({
    description:
      'Existing final S3 object key. Omit it only for the first batch.',
  })
  @IsOptional()
  @IsString()
  storagePath?: string;

  @ApiProperty({
    description: 'First multipart part number to presign',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startPartNumber!: number;

  @ApiProperty({
    description: 'Number of presigned part URLs to return',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  partCount!: number;
}

export class CompletedRecordingPartDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partNumber!: number;

  @ApiProperty({
    description: 'ETag returned by S3 after uploading this part',
    example: '"9b2cf535f27731c974343645a3985328"',
  })
  @IsString()
  etag!: string;
}

export class CompleteRecordingDto {
  @ApiProperty({ example: '6accc2074f59dd54ee0591ef' })
  @IsMongoId()
  rolePlayId!: string;

  @ApiProperty({ example: '6accc2254f59dd54ee0591f0' })
  @IsMongoId()
  sessionId!: string;

  @ApiProperty({
    description: 'Multipart upload id returned by batch-presign-url',
  })
  @IsString()
  uploadId!: string;

  @ApiProperty({
    description: 'Final S3 object key returned by batch-presign-url',
  })
  @IsString()
  storagePath!: string;

  @ApiProperty({ type: [CompletedRecordingPartDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompletedRecordingPartDto)
  parts!: CompletedRecordingPartDto[];
}

export class AbortRecordingDto {
  @ApiProperty({ example: '6accc2074f59dd54ee0591ef' })
  @IsMongoId()
  rolePlayId!: string;

  @ApiProperty({ example: '6accc2254f59dd54ee0591f0' })
  @IsMongoId()
  sessionId!: string;

  @ApiProperty({
    description: 'Multipart upload id returned by batch-presign-url',
  })
  @IsString()
  uploadId!: string;

  @ApiProperty({
    description: 'Final S3 object key returned by batch-presign-url',
  })
  @IsString()
  storagePath!: string;
}
