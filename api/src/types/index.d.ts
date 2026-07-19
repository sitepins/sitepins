import { JwtPayload } from "jsonwebtoken";
import { SortOrder } from "mongoose";

export type IErrorMessage = {
  message: string;
  path: string;
};

export type IErrorResponse = {
  errorMessage: IErrorMessage[];
  statusCode: number;
  message: string;
};

export type IPagination = {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: SortOrder;
};

export type IFilterOptions = {
  published?: boolean;
  theme?: string;
  trash?: boolean;
  search?: string | number;
};

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | null;
    }
  }
}
