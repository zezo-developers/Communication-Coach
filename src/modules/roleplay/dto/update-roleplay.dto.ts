import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { CreateRolePlayDto } from './create-roleplay.dto';
import {
  CreateRolePlayPersonaDto,
  UpdateRolePlayPersonaDto,
} from './roleplay-persona.dto';

export class UpdateRolePlayDto extends PartialType(CreateRolePlayDto) {
  // Overridden so a partial persona can be sent without repeating every field;
  // the service merges it into the stored persona instead of replacing it.
  @ApiPropertyOptional({
    description: 'Fields to change on the AI persona',
    type: UpdateRolePlayPersonaDto,
  })
  @IsOptional()
  @ValidateNested({ message: 'aiPersona must be a valid persona object' })
  @Type(() => CreateRolePlayPersonaDto)
  aiPersona?: CreateRolePlayPersonaDto;
}
