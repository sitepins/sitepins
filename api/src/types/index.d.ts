import { SortOrder } from "mongoose";

export type TErrorMessage = {
  message: string;
  path: string;
};

export type TErrorResponse = {
  errorMessage: TErrorMessage[];
  statusCode: number;
  message: string;
};

export type TPagination = {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: SortOrder;
};

export type TFilterOptions = {
  published?: boolean;
  theme?: string;
  trash?: boolean;
  search?: string | number;
};

// Populated by authMiddleware from either a better-auth session or a verified
// JWT. Only `user_id` is guaranteed on both paths; the index signature keeps
// extra claims/session fields reachable for extension hooks.
export type TAuthUser = {
  user_id: string;
  role?: string;
  email?: string;
  full_name?: string;
  [key: string]: unknown;
};

declare global {
  namespace Express {
    interface Request {
      user?: TAuthUser | null;
      /** Set by internalOrAuth when the caller presented INTERNAL_API_SECRET. */
      isInternal?: boolean;
    }
  }
}
