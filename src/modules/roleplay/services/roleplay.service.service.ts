import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery, isValidObjectId } from 'mongoose';
import {
  RolePlay,
  RolePlayDifficulty,
  RolePlayDocument,
  RolePlayPersona,
} from '@/database/schemas/rolePlay.schema';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  PaginationQueryDto,
} from '@common/dto/pagination-query.dto';
import { PaginatedResult } from '@common/interfaces/paginated-result.interface';
import { CreateRolePlayDto } from '../dto/create-roleplay.dto';
import { CreateRolePlayPersonaDto } from '../dto/roleplay-persona.dto';
import { UpdateRolePlayDto } from '../dto/update-roleplay.dto';
import {
  QueryRolePlayDto,
  ROLEPLAY_DEFAULT_SORT_FIELD,
  ROLEPLAY_SORT_FIELDS,
} from '../dto/query-roleplay.dto';

/**
 * The subset of Mongo filters this service builds. Declared locally so the
 * service does not depend on mongoose's version-specific filter type alias
 * (`FilterQuery` in v8, renamed to `QueryFilter` in v9).
 */
interface RolePlayFilter {
  category?: string;
  difficulty?: RolePlayDifficulty;
  isActive?: boolean;
  $or?: Array<{ title: RegExp } | { description: RegExp }>;
}

@Injectable()
export class RoleplayService {
  private readonly logger = new Logger(RoleplayService.name);

  // Fields a client may sort by; anything else falls back to the default.
  private static readonly SORTABLE_FIELDS = new Set<string>(
    ROLEPLAY_SORT_FIELDS,
  );

  constructor(
    @InjectModel(RolePlay.name)
    private readonly rolePlayModel: Model<RolePlay>,
  ) {}

  // ---------------------------
  // VALIDATION & NORMALIZATION HELPERS
  // ---------------------------

  // Rejects ids that can never match a document, so a malformed id is a 400 instead of an empty result.
  private assertValidId(id: string): void {
    if (!isValidObjectId(id)) {
      throw new BadRequestException('Invalid roleplay id');
    }
  }

  // Loads a roleplay by id or throws 404, giving every public method the same failure mode.
  private async getRolePlayOrFail(id: string): Promise<RolePlayDocument> {
    this.assertValidId(id);

    const rolePlay = await this.rolePlayModel.findById(id).exec();
    if (!rolePlay) {
      throw new NotFoundException(`Roleplay with id ${id} not found`);
    }

    return rolePlay;
  }

  // Trims a required string and rejects values that become empty, so whitespace-only input cannot pass.
  private normalizeRequired(
    value: string,
    field: string,
    minLength = 1,
  ): string {
    const normalized = value.trim();
    if (normalized.length < minLength) {
      throw new BadRequestException(
        `${field} must be at least ${minLength} character(s) long`,
      );
    }
    return normalized;
  }

  // Trims an optional string, returning undefined when nothing meaningful is left.
  private normalizeOptional(value?: string): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  // Normalizes a persona payload into the stored shape, dropping empty optional fields.
  private normalizePersona(persona: CreateRolePlayPersonaDto): RolePlayPersona {
    const normalized: RolePlayPersona = {
      name: this.normalizeRequired(persona.name, 'Persona name'),
      role: this.normalizeRequired(persona.role, 'Persona role'),
    };

    const personality = this.normalizeOptional(persona.personality);
    if (personality) {
      normalized.personality = personality;
    }

    return normalized;
  }

  // Trims objectives, drops blanks and removes duplicates so the stored list stays clean.
  private normalizeObjectives(objectives?: string[]): string[] {
    if (!objectives?.length) {
      return [];
    }

    const cleaned = objectives
      .map((objective) => objective.trim())
      .filter((objective) => objective.length > 0);

    return [...new Set(cleaned)];
  }

  // Drops undefined entries so a partial payload never overwrites a stored value with nothing.
  private stripUndefined<T extends Record<string, unknown>>(
    value: T,
  ): Partial<T> {
    const defined = Object.entries(value).filter(([, v]) => v !== undefined);
    return Object.fromEntries(defined) as Partial<T>;
  }

  // Reads the stored persona's fields, whether mongoose hands back a subdocument or a plain object.
  private toPlainPersona(
    persona: RolePlayPersona | undefined,
  ): Partial<RolePlayPersona> {
    if (!persona) {
      return {};
    }

    return this.stripUndefined({
      name: persona.name,
      role: persona.role,
      personality: persona.personality,
    });
  }

  // Escapes regex metacharacters so a search term is matched literally, not as a pattern.
  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ---------------------------
  // QUERY BUILDING
  // ---------------------------

  // Translates the query DTO into a Mongo filter using only allowlisted fields.
  private buildFilter(query: QueryRolePlayDto): RolePlayFilter {
    const filter: RolePlayFilter = {};

    const category = query.category?.trim();
    if (category) {
      filter.category = category;
    }

    if (query.difficulty) {
      filter.difficulty = query.difficulty;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    const search = query.search?.trim();
    if (search) {
      const pattern = new RegExp(this.escapeRegExp(search), 'i');
      filter.$or = [{ title: pattern }, { description: pattern }];
    }

    return filter;
  }

  // Builds the sort spec from the allowlist, appending `_id` so paging stays stable on ties.
  private buildSort(query: QueryRolePlayDto): Record<string, 1 | -1> {
    const field =
      query.sortBy && RoleplayService.SORTABLE_FIELDS.has(query.sortBy)
        ? query.sortBy
        : ROLEPLAY_DEFAULT_SORT_FIELD;
    const direction: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;

    return { [field]: direction, _id: direction };
  }

  // Clamps paging input to safe bounds so a hostile page/limit cannot exhaust the database.
  private normalizePagination(query: PaginationQueryDto): {
    page: number;
    limit: number;
    skip: number;
  } {
    const requestedLimit = Number(query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_PAGE_LIMIT)
      : DEFAULT_PAGE_LIMIT;

    const requestedPage = Number(query.page);
    const page = Number.isFinite(requestedPage)
      ? Math.max(Math.trunc(requestedPage), 1)
      : DEFAULT_PAGE;

    return { page, limit, skip: (page - 1) * limit };
  }

  // Shapes a page of results together with the navigation metadata clients need.
  private buildPaginatedResult<T>(
    data: T[],
    totalCounts: number,
    currentPage: number,
    limit: number,
  ): PaginatedResult<T> {
    const totalPages = limit > 0 ? Math.ceil(totalCounts / limit) : 0;
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1 && totalPages > 0;

    return {
      data,
      totalCounts,
      currentPage,
      totalPages,
      limit,
      hasNextPage,
      hasPrevPage,
      nextPage: hasNextPage ? currentPage + 1 : null,
      prevPage: hasPrevPage ? currentPage - 1 : null,
    };
  }

  // ---------------------------
  // ROLEPLAY CRUD
  // ---------------------------

  // Creates a roleplay scenario; admin-only, enforced by PermissionsGuard at the controller.
  async create(dto: CreateRolePlayDto): Promise<RolePlayDocument> {
    const created = await this.rolePlayModel.create({
      title: this.normalizeRequired(dto.title, 'Title', 3),
      description: this.normalizeRequired(dto.description, 'Description', 10),
      category: this.normalizeRequired(dto.category, 'Category', 2),
      difficulty: dto.difficulty ?? RolePlayDifficulty.INTERMEDIATE,
      systemPrompt: this.normalizeRequired(
        dto.systemPrompt,
        'System prompt',
        10,
      ),
      aiPersona: this.normalizePersona(dto.aiPersona),
      objectives: this.normalizeObjectives(dto.objectives),
      isActive: dto.isActive ?? true,
    });

    this.logger.log(`Roleplay created: ${created._id.toString()}`);
    return created;
  }

  // Lists roleplays with pagination, search and allowlisted filters/sorting; available to any authenticated user.
  async findAll(query: QueryRolePlayDto): Promise<PaginatedResult<RolePlay>> {
    const { page, limit, skip } = this.normalizePagination(query);
    const filter = this.buildFilter(query);
    const sort = this.buildSort(query);

    const [data, totalCounts] = await Promise.all([
      this.rolePlayModel.find(filter).sort(sort).skip(skip).limit(limit).exec(),
      this.rolePlayModel.countDocuments(filter).exec(),
    ]);

    return this.buildPaginatedResult(data, totalCounts, page, limit);
  }

  // Returns one roleplay by id, including inactive ones so admins can review them.
  async findOne(id: string): Promise<RolePlayDocument> {
    return this.getRolePlayOrFail(id);
  }

  // Applies a partial update; only the provided fields change and the persona is merged, not replaced.
  async update(id: string, dto: UpdateRolePlayDto): Promise<RolePlayDocument> {
    const existing = await this.getRolePlayOrFail(id);
    const updates: UpdateQuery<RolePlay> = {};

    if (dto.title !== undefined) {
      updates.title = this.normalizeRequired(dto.title, 'Title', 3);
    }
    if (dto.description !== undefined) {
      updates.description = this.normalizeRequired(
        dto.description,
        'Description',
        10,
      );
    }
    if (dto.category !== undefined) {
      updates.category = this.normalizeRequired(dto.category, 'Category', 2);
    }
    if (dto.difficulty !== undefined) {
      updates.difficulty = dto.difficulty;
    }
    if (dto.systemPrompt !== undefined) {
      updates.systemPrompt = this.normalizeRequired(
        dto.systemPrompt,
        'System prompt',
        10,
      );
    }
    if (dto.objectives !== undefined) {
      updates.objectives = this.normalizeObjectives(dto.objectives);
    }
    if (dto.isActive !== undefined) {
      updates.isActive = dto.isActive;
    }

    if (dto.aiPersona !== undefined) {
      // Merged, so omitting a persona field keeps its stored value.
      updates.aiPersona = {
        ...this.toPlainPersona(existing.aiPersona),
        ...this.stripUndefined({
          name:
            dto.aiPersona.name !== undefined
              ? this.normalizeRequired(dto.aiPersona.name, 'Persona name')
              : undefined,
          role:
            dto.aiPersona.role !== undefined
              ? this.normalizeRequired(dto.aiPersona.role, 'Persona role')
              : undefined,
          personality: this.normalizeOptional(dto.aiPersona.personality),
        }),
      };
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException('No fields to update');
    }

    const updated = await this.rolePlayModel
      .findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Roleplay with id ${id} not found`);
    }

    this.logger.log(`Roleplay updated: ${id}`);
    return updated;
  }

  // Soft-deletes a roleplay by clearing its active flag, preserving session and report history.
  async remove(id: string): Promise<{ id: string; message: string }> {
    const rolePlay = await this.getRolePlayOrFail(id);

    if (!rolePlay.isActive) {
      throw new BadRequestException('Roleplay is already inactive');
    }

    await this.rolePlayModel
      .updateOne({ _id: id }, { $set: { isActive: false } })
      .exec();

    this.logger.log(`Roleplay deactivated: ${id}`);
    return { id, message: 'Roleplay deactivated successfully' };
  }
}
