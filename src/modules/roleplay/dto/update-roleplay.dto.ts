import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
  @Transform(({ value, obj }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }

    if (obj && typeof obj === 'object') {
      const flattenedEntries = Object.entries(obj).filter(([key]) =>
        key.startsWith('aiPersona['),
      );

      if (flattenedEntries.length > 0) {
        const merged: Record<string, any> = {};
        for (const [key, nestedValue] of flattenedEntries) {
          const match = key.match(/^aiPersona\[(.+)\]$/);
          if (match) {
            merged[match[1]] = nestedValue;
          }
        }
        return merged;
      }
    }

    return value;
  })
  @IsOptional()
  @ValidateNested({ message: 'aiPersona must be a valid persona object' })
  @Type(() => CreateRolePlayPersonaDto)
  aiPersona?: CreateRolePlayPersonaDto;
}
