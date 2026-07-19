"use server";

import { getAuth } from "@/lib/auth/auth-server";
import { revalidateTag } from "next/cache";
import { TInsertionSuccess, fetchApi } from "../utils";
import { TProvider } from "./types";

export const getProviders = async (user_id?: string) => {
  const auth = await getAuth();

  if (!auth) {
    throw new Error("User must be logged in");
  }

  const providers = await fetchApi<TInsertionSuccess<TProvider[]>>({
    endPoint: `/provider/${user_id ?? auth.user.user_id}`,
    method: "GET",
    cache: "no-store",
    tags: ["providers"],
  });

  return providers.body.result;
};

export const createProvider = async (provider: TProvider) => {
  const providers = await fetchApi<
    TInsertionSuccess<
      TProvider & {
        variables: TProvider;
      }
    >
  >({
    endPoint: "/provider/create",
    method: "POST",
    body: {
      ...provider,
    },
  });

  revalidateTag("providers", "max");
  return providers.body.result;
};
