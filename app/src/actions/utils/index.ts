"use server";

import { authCookies } from "@/lib/auth/auth-server";
import { API_URL, IS_DEMO } from "@/lib/constant";
import { CustomApiError } from "@/lib/utils/custom-api-error";
import { revalidatePath, revalidateTag } from "next/cache";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type TExtractVariables<T> = T extends { variables: object }
  ? T["variables"]
  : never;

export type TSubmitFormState<T> = {
  data: Omit<T, "variables"> | null;
  error: {
    path: string;
    message: string;
  }[];
  message: string | null;
  isError: boolean;
  isSuccess: boolean;
  statusCode: number | null;
};

export type TInsertionSuccess<T> = {
  success: true;
  message: "data inserted successfully";
  result: T;
} & {
  variables: TExtractVariables<T>;
};

export async function fetchApi<T>({
  endPoint,
  cache = "force-cache",
  headers = {},
  tags = [],
  body,
  method = "GET",
}: {
  endPoint: string;
  cache?: RequestCache;
  headers?: HeadersInit;
  tags?: string[];
  body?: TExtractVariables<T> | FormData;
  method?: HttpMethod;
}): Promise<{ status: number; body: Omit<T, "variables"> }> {
  if (IS_DEMO && method !== "GET") {
    return {
      status: 403,
      body: {
        message: "Demo mode: changes are not saved.",
        result: null,
      } as any,
    };
  }

  try {
    const cookieHeaders = await authCookies();
    const headersObj = {
      "Content-Type": "application/json",
      "X-App-Context": IS_DEMO ? "demo" : "app",
      ...headers,
      ...cookieHeaders.headers,
    };

    if (body instanceof FormData) {
      // @ts-ignore
      delete headersObj["Content-Type"];
    }

    const requestBody =
      body instanceof FormData
        ? body
        : typeof body === "string"
          ? body
          : JSON.stringify(body);

    const result = await fetch(API_URL + endPoint, {
      method,
      headers: headersObj,
      ...(method !== "GET" && { body: requestBody }),
      cache,
      ...(tags.length > 0 && { next: { tags } }),
    });

    const responseBody = await result.json();

    if (!result.ok) {
      const customError = new CustomApiError(
        result.status,
        responseBody?.message,
        responseBody?.errorMessage ?? [],
      );

      // Check if the error is related to token verification
      if (
        responseBody?.message === "Token verification failed" ||
        responseBody?.errorMessage?.some(
          (err: { path: string; message: string }) =>
            err.message === "Token verification failed",
        )
      ) {
        customError.tokenVerificationFailed = true;
      }

      throw customError;
    }

    return {
      status: result.status,
      body: responseBody,
    };
  } catch (error) {
    throw error;
  }
}

export async function mutate<T>(
  callback: () => Promise<any>,
): Promise<TSubmitFormState<T>> {
  if (IS_DEMO) {
    return {
      data: null,
      error: [],
      message: "Demo mode: changes are not saved.",
      isError: true,
      isSuccess: false,
      statusCode: 403,
    };
  }

  try {
    const { body, status } = (await callback()) || {};
    return {
      data: body.result as T,
      error: [],
      message: body.message,
      isError: false,
      isSuccess: true,
      statusCode: status,
    };
  } catch (err) {
    if (err instanceof CustomApiError) {
      return {
        data: null,
        isError: true,
        isSuccess: false,
        error: err.errorMessage,
        message: err.message,
        statusCode: err.statusCode,
      };
    }

    return {
      data: null,
      isError: true,
      isSuccess: false,
      error: [],
      message: err instanceof Error ? err.message : "Something went wrong",
      statusCode: 500,
    };
  }
}

export const revalidateRefresh = async (
  paths: { originalPath: string; type?: "layout" | "page" | "tag" }[],
) => {
  paths.forEach(({ originalPath, type }) => {
    if (type === "tag") {
      revalidateTag(originalPath, "max");
      return;
    }
    revalidatePath(originalPath, type);
  });
};

