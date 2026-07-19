import { Response } from "express";

export type IApiResponse<T> = {
  statusCode?: number;
  success?: boolean;
  message?: string | null;
  result?: T | null;
  meta?: {
    page?: number | null;
    limit?: number | null;
    total?: number;
    isEmpty?: boolean;
  };
};

export const sendResponse = <T>(res: Response, response: IApiResponse<T>) => {
  res.status(response.statusCode || 200).json({
    success: response.success,
    message: response.message,
    result: response.result,
    meta: response.meta,
  });
};
