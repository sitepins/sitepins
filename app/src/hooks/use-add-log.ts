import { authClient } from "@/lib/auth/auth-client";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { TLog } from "@/redux/features/project-log/type";
import { useCallback } from "react";

export type LogEntry = Omit<TLog, "_id" | "user_id">;

/**
 * Fills `user_id` from the session. Call sites used to assert it non-null off
 * an optional chain, which sent `undefined` whenever the session was missing;
 * here the entry is dropped instead, since an activity log without an actor
 * is not worth writing.
 */
export const useAddLog = () => {
  const [addProjectLog, state] = useAddProjectLogMutation();
  const { data: auth } = authClient.useSession();
  const userId = auth?.user.user_id;

  const addLog = useCallback(
    async (entry: LogEntry) => {
      if (!userId) return;
      return addProjectLog({ ...entry, user_id: userId });
    },
    [addProjectLog, userId],
  );

  return [addLog, state] as const;
};
