import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateSelfDto {
  @ApiPropertyOptional({ description: 'Updated first name', example: 'John' })
  @IsOptional()
  @IsString({ message: 'First name must be a valid string' })
  @MinLength(1, { message: 'First name must be at least 1 character long' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Updated last name', example: 'Doe' })
  @IsOptional()
  @IsString({ message: 'Last name must be a valid string' })
  @MinLength(1, { message: 'Last name must be at least 1 character long' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  lastName?: string;

  // The file itself arrives on `request.file` (see `@UploadedFile()` in the
  // controller); it is declared here so Swagger renders the multipart field.
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description:
      'Avatar image (JPEG, PNG or WebP, max 5 MB). Send as multipart/form-data. Replaces the existing avatar, which is deleted from storage.',
  })
  @IsOptional()
  avatar?: Express.Multer.File;
}
