import { IPagination } from "@/types";

export type IPaginationResult = IPagination & {
  skip: number;
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

const calculatePagination = (
  options: Partial<IPagination>
): IPaginationResult => {
  const parsedPage = Number(options.page);
  const parsedLimit = Number(options.limit);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_LIMIT;
  const skip = (page - 1) * limit;
  const sortBy = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder || "desc";

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
