import { IPagination } from "@/types";

export type IPaginationResult = IPagination & {
  skip: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
// Caps `?limit=` so a single request can't pull an entire collection into
// memory.
const MAX_LIMIT = 200;
// `sortBy` is interpolated into a `$sort` stage, so it is an allowlist rather
// than free text.
const SORTABLE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "project_name",
  "org_name",
  "full_name",
  "email",
  "status",
  "package",
  "billing_period",
  "expires_date",
]);

const calculatePagination = (
  options: Partial<IPagination>,
): IPaginationResult => {
  const parsedPage = Number(options.page);
  const parsedLimit = Number(options.limit);
  const page =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;
  const skip = (page - 1) * limit;
  const requestedSortBy = options.sortBy;
  const sortBy =
    typeof requestedSortBy === "string" && SORTABLE_FIELDS.has(requestedSortBy)
      ? requestedSortBy
      : "createdAt";
  const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

  return {
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
  };
};

export const paginationHelpers = {
  calculatePagination,
};
