"use client";

import { authClient } from "@/lib/auth/auth-client";
import { useCheckLimitsMutation } from "@/redux/features/user/user-api";
import { useEffect } from "react";

export default function LimitChecker() {
  const { data: session } = authClient.useSession();
  const [checkLimits] = useCheckLimitsMutation();

  useEffect(() => {
    if (session?.user) {
      checkLimits({});
    }
  }, [session, checkLimits]);

  return null;
}
