/**
 * Envelope returned by every paginated list endpoint.
 *
 * Field names follow the project's service conventions (`totalCounts`,
 * `currentPage`) and add explicit navigation flags so clients never have to
 * derive them.
 */
export interface PaginatedResult<T> {
  data: T[];
  totalCounts: number;
  currentPage: number;
  totalPages: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
}
