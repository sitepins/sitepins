import { Response } from "express";

export type TApiResponse<T> = {
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

export const sendResponse = <T>(res: Response, response: TApiResponse<T>) => {
  res.status(response.statusCode || 200).json({
    success: response.success,
    message: response.message,
    result: response.result,
    meta: response.meta,
  });
};
