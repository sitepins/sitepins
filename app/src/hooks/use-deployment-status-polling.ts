import {
  isTerminalDeploymentStatus,
  NO_STATUS_SENTINEL,
} from "@/lib/utils/deployment-status";
import { useEffect, useRef, useState } from "react";

const MAX_NO_STATUS_POLLS = 5;
const POLL_INTERVAL_MS = 2000;

// Returns the interval (in ms) to use for the next deployment status poll, based on the current status and how long we've been polling with no status.
export function useDeploymentStatusPollingInterval(
  status: string | undefined,
): number {
  const [stopForNoStatus, setStopForNoStatus] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === NO_STATUS_SENTINEL) {
      // Start the give-up timer only once per no_status streak.
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setStopForNoStatus(true);
        }, MAX_NO_STATUS_POLLS * POLL_INTERVAL_MS);
      }
    } else {
      // A real status (or undefined on load) arrived – cancel give-up timer and reset.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // setStopForNoStatus(false) is a no-op when already false; React bails out.
      setStopForNoStatus(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status]);

  // Real terminal state (success / failure / cancelled …) → stop immediately.
  if (isTerminalDeploymentStatus(status) && status !== NO_STATUS_SENTINEL) {
    return 0;
  }

  // no_status give-up timer fired → stop polling.
  if (stopForNoStatus) {
    return 0;
  }

  return POLL_INTERVAL_MS;
}
