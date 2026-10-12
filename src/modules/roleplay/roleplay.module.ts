import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolePlay, RolePlaySchema } from '@/database/schemas/rolePlay.schema';
import {
  RolePlaySession,
  RolePlaySessionSchema,
} from '@/database/schemas/rolePlaySession.schema';
import { User, UserSchema } from '@/database/schemas/user.schema';
import { AuthModule } from 'src/modules/auth/auth.module';
import { FileModule } from 'src/modules/file/file.module';
import { RecordingModule } from '@/modules/recording/recording.module';
import { RoleplayController } from './controllers/roleplay.controller.controller';
import { RoleplayService } from './services/roleplay.service.service';
import { RoleplalySessionService } from './services/roleplaly-session.service';
import { RoleplalySessionController } from './controllers/roleplaly-session.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RolePlay.name, schema: RolePlaySchema },
      { name: RolePlaySession.name, schema: RolePlaySessionSchema },
      { name: User.name, schema: UserSchema },
    ]),
    // Supplies JwtAuthGuard and PermissionsGuard to this module's controllers.
    AuthModule,
    FileModule,
    RecordingModule,
  ],
  controllers: [RoleplayController, RoleplalySessionController],
  providers: [RoleplayService, RoleplalySessionService],
  exports: [RoleplayService],
})
export class RoleplayModule {}
