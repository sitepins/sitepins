"use server";

import { TExtractVariables } from "@/types";
import { fetchApi, mutate } from "../utils";
import { TDeleteAccount, TSaveProfilePicture } from "./types";

export const updateImage = async (
  data: TExtractVariables<TSaveProfilePicture>,
) => {
  const response = await mutate<TSaveProfilePicture>(async () => {
    return await fetchApi<TSaveProfilePicture>({
      endPoint: "/bucket/upload",
      method: "POST",
      body: data,
    });
  });

  return response;
};

export const deleteAccountAction = async (
  data: TExtractVariables<TDeleteAccount>,
) => {
  return await mutate<TDeleteAccount>(async () => {
    return await fetchApi<TDeleteAccount>({
      endPoint: `/user/delete/${data.user_id}`,
      method: "DELETE",
      cache: "no-cache",
      body: data,
    });
  });
};
