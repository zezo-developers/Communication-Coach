import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  RolePlaySession,
  RolePlaySessionSchema,
} from '@/database/schemas/rolePlaySession.schema';
import { S3Service } from './services/s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RolePlaySession.name, schema: RolePlaySessionSchema },
    ]),
  ],
  providers: [S3Service],
  exports: [S3Service],
})
export class FileModule {}
