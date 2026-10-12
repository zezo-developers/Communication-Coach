import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class CreateRolePlaySessionDto {
  @ApiProperty({
    description: 'Roleplay scenario id to start for the authenticated user',
    example: '65f1c2a4b3d4e5f6a7b8c9d0',
  })
  @IsMongoId({ message: 'rolePlayId must be a valid Mongo ObjectId' })
  rolePlayId!: string;
}
