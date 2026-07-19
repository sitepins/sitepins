import config from "@/config/variables";
import ApiError from "@/errors/ApiError";
import { handleValidationErrors } from "@/errors/handleValidationError";
import { IErrorMessage } from "@/types";
import { ErrorRequestHandler } from "express";

export const globalErrorhandler: ErrorRequestHandler = (
  error,
  req,
  res,
  next
) => {
  let statuscode = 500;
  let message = "something went wrong";
  let errorMessage: IErrorMessage[] = [];
  if (error.name === "ValidationError") {
    const simplifiedErrors = handleValidationErrors(error);
    statuscode = simplifiedErrors.statusCode;
    errorMessage = simplifiedErrors.errorMessage;
    message = simplifiedErrors.message;
  } else if (error.message === "jwt expired") {
    statuscode = 401;
    message = error.message;
    errorMessage = error?.message
      ? [
          {
            path: "",
            message: error?.message,
          },
        ]
      : [];
  } else if (error instanceof ApiError) {
    statuscode = error?.statusCode;
    message = error.message;
    errorMessage = error?.message
      ? [
          {
            path: "",
            message: error?.message,
          },
        ]
      : [];
  } else if (error instanceof Error) {
    message = error.message;
    errorMessage = error?.message
      ? [
          {
            path: "",
            message: error?.message,
          },
        ]
      : [];
  }
  res.status(statuscode).json({
    success: false,
    message,
    errorMessage,
    ...(config.env === "development" && { stack: error.stack }),
  });
  next();
};
