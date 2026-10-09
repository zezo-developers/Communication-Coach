import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '@common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/modules/auth/guards/permissions.guard';
import { RolePlayDifficulty } from '@/database/schemas/rolePlay.schema';

import { RoleplayService } from '../services/roleplay.service.service';
import { CreateRolePlayDto } from '../dto/create-roleplay.dto';
import { UpdateRolePlayDto } from '../dto/update-roleplay.dto';
import {
  QueryRolePlayDto,
  ROLEPLAY_SORT_FIELDS,
} from '../dto/query-roleplay.dto';

@ApiTags('RolePlay')
@Controller('roleplays')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
// Scoped to this controller on purpose: the app registers no global
// ValidationPipe, so without this the query DTO's @Type coercion and defaults
// would never run.
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class RoleplayController {
  constructor(private readonly roleplayService: RoleplayService) {}

  // Lists roleplay scenarios with pagination, search and filters for any authenticated user.
  @Get()
  @ApiOperation({
    summary: 'List roleplay scenarios',
    description:
      'Returns a paginated list of roleplay scenarios. Any authenticated user may browse them. Supports free-text search, category/difficulty/active filters and allowlisted sorting.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'negotiation',
    description: 'Case-insensitive match on title and description',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    example: 'workplace-communication',
  })
  @ApiQuery({
    name: 'difficulty',
    required: false,
    enum: RolePlayDifficulty,
    example: RolePlayDifficulty.INTERMEDIATE,
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    example: true,
    description: 'Omit to return both active and inactive scenarios',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: [...ROLEPLAY_SORT_FIELDS],
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
  })
  async findAll(@Query() query: QueryRolePlayDto) {
    return this.roleplayService.findAll(query);
  }

  // Returns a single roleplay scenario, including inactive ones, for any authenticated user.
  @Get(':id')
  @ApiOperation({
    summary: 'Get a roleplay scenario',
    description:
      'Returns one roleplay scenario by its id. Inactive scenarios are returned too, so admins can review them.',
  })
  @ApiParam({
    name: 'id',
    description: 'Roleplay id',
    example: '65f1c2a4b3d4e5f6a7b8c9d0',
  })
  async findOne(@Param('id') id: string) {
    return this.roleplayService.findOne(id);
  }

  // Creates a roleplay scenario; restricted to admins.
  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('create:roleplay')
  @ApiOperation({
    summary: 'Create a roleplay scenario',
    description:
      'Creates a new roleplay scenario with its AI persona, system prompt and objectives. Requires the create:roleplay permission (admin only).',
  })
  @ApiBody({ type: CreateRolePlayDto })
  async create(@Body() dto: CreateRolePlayDto) {
    return this.roleplayService.create(dto);
  }

  // Applies a partial update to a roleplay scenario; restricted to admins.
  @Patch(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('update:roleplay')
  @ApiOperation({
    summary: 'Update a roleplay scenario',
    description:
      'Updates only the provided fields of a roleplay scenario. The AI persona is merged, so omitted persona fields keep their stored values. Requires the update:roleplay permission (admin only).',
  })
  @ApiParam({
    name: 'id',
    description: 'Roleplay id',
    example: '65f1c2a4b3d4e5f6a7b8c9d0',
  })
  @ApiBody({ type: UpdateRolePlayDto })
  async update(@Param('id') id: string, @Body() dto: UpdateRolePlayDto) {
    return this.roleplayService.update(id, dto);
  }

  // Deactivates a roleplay scenario (soft delete); restricted to admins.
  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('delete:roleplay')
  @ApiOperation({
    summary: 'Deactivate a roleplay scenario',
    description:
      'Soft-deletes a roleplay scenario by clearing its active flag, keeping session and report history intact. Re-activate it with PATCH and isActive: true. Requires the delete:roleplay permission (admin only).',
  })
  @ApiParam({
    name: 'id',
    description: 'Roleplay id',
    example: '65f1c2a4b3d4e5f6a7b8c9d0',
  })
  async remove(@Param('id') id: string) {
    return this.roleplayService.remove(id);
  }
}
