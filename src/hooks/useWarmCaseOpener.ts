import { useEffect } from "react";
import { getValidAccessToken } from "../services/auth";
import { warmCaseOpener } from "../services/api";

/**
 * Prefetch the case-opening Lambda while a signed-in user browses. The call
 * is throttled inside `warmCaseOpener`, so mounting this on multiple routes
 * is cheap.
 */
export function useWarmCaseOpener(user: any): void {
  const userId = user?.userId || user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void (async () => {
      const token = await getValidAccessToken();
      if (!cancelled && token) await warmCaseOpener(token);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
