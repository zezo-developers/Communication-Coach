import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RolePlay, RolePlaySchema } from '@/database/schemas/rolePlay.schema';
import { AuthModule } from 'src/modules/auth/auth.module';
import { RoleplayController } from './controllers/roleplay.controller.controller';
import { RoleplayService } from './services/roleplay.service.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RolePlay.name, schema: RolePlaySchema },
    ]),
    // Supplies JwtAuthGuard and PermissionsGuard to this module's controllers.
    AuthModule,
  ],
  controllers: [RoleplayController],
  providers: [RoleplayService],
  exports: [RoleplayService],
})
export class RoleplayModule {}
