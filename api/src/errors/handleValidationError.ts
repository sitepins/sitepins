import type { IErrorMessage, IErrorResponse } from "@/types";
import mongoose from "mongoose";

export const handleValidationErrors = (
  error: mongoose.Error.ValidationError
): IErrorResponse => {
  const errors: IErrorMessage[] = Object.keys(error.errors).map(
    (el: string) => {
      return {
        path: error.errors[el].path,
        message: error.errors[el].message,
      };
    }
  );
  const statusCode = 500;
  return {
    message: "Validation Error",
    errorMessage: errors,
    statusCode: statusCode,
  };
};
