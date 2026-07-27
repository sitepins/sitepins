import { API_URL, IS_DEMO } from "@/lib/constant";
import { SerializedError } from "@reduxjs/toolkit";
import { BaseQueryFn, createApi } from "@reduxjs/toolkit/query/react";
import axios, { AxiosError, AxiosRequestConfig } from "axios";

// Define API error types with stronger type safety
export interface ValidationError {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  message: string;
  errorMessage?: ValidationError[];
}

export interface ApiError {
  status: number;
  data: ApiErrorResponse;
}

// Custom error type for the base query
export interface AxiosBaseQueryError {
  status: number;
  data: ApiErrorResponse;
}

// Type guard to check if an error is an API error
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "data" in error &&
    typeof (error as ApiError).data === "object" &&
    "message" in (error as ApiError).data
  );
}

// Type guard to check if an error is a SerializedError from RTK
export function isSerializedError(error: unknown): error is SerializedError {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    "message" in error &&
    "code" in error
  );
}

// Type guard to check if the error is from Axios
export function isAxiosError<T = any>(error: unknown): error is AxiosError<T> {
  return axios.isAxiosError(error);
}

const axiosBaseQuery =
  (
    {
      baseUrl,
      withCredentials,
    }: { baseUrl: string; withCredentials?: boolean } = {
      baseUrl: "",
    },
  ): BaseQueryFn<
    {
      url: string;
      method?: AxiosRequestConfig["method"];
      data?: AxiosRequestConfig["data"];
      params?: AxiosRequestConfig["params"];
      headers?: AxiosRequestConfig["headers"];
    },
    unknown,
    unknown
  > =>
  async ({ url, method, data, params, headers }) => {
    if (IS_DEMO && method && method !== "GET") {
      return {
        error: {
          status: 403,
          data: {
            message: "Demo mode: changes are not saved.",
          },
        },
      };
    }

    try {
      const result = await axios({
        url: baseUrl + url,
        method,
        data,
        params,
        headers: {
          "X-App-Context": IS_DEMO ? "demo" : "app",
          ...headers,
        },
        withCredentials,
      });
      if (result.data?.result) {
        return { data: result.data.result };
      }
      return { data: result.data };
    } catch (axiosError) {
      if (isAxiosError(axiosError) && axiosError.response) {
        return {
          error: {
            status: axiosError.response.status,
            data: {
              message: axiosError.response.data.message,
            },
          },
        };
      }
      return {
        error: {
          status: (axiosError as any)?.code || 500,
          data: {
            message:
              "Server is unreachable. Please check your internet connection or try again later.",
          },
        },
      };
    }
  };

// Helper function to extract error messages from different error types
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.data.errorMessage && error.data.errorMessage.length > 0) {
      return error.data.errorMessage.map((e) => e.message).join(", ");
    }
    return error.data.message;
  }

  if (isSerializedError(error)) {
    return error.message || "An unknown error occurred";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred";
}

// Create the API instance
export const api = createApi({
  reducerPath: "api",
  tagTypes: [
    "Orgs",
    "Org",
    "Projects",
    "Project",
    "ProjectContent",
    "Providers",
    "package",
    "User",
    "ProjectLog",
    "trial",
    "UserPersona",
    "UserPreference",
  ],
  baseQuery: axiosBaseQuery({ baseUrl: API_URL!, withCredentials: true }), // withCredentials: true for cookie attached to headers
  endpoints: (_builder) => ({}),
});

// Type-safe hook for handling RTK Query errors
export function useApiErrorHandler(
  error?: AxiosBaseQueryError | SerializedError | unknown,
): { errorMessage: string | null; isError: boolean } {
  if (!error) {
    return { errorMessage: null, isError: false };
  }

  return {
    errorMessage: getErrorMessage(error),
    isError: true,
  };
}
