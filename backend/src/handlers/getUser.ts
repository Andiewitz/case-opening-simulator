import { json, preflight, requireAuth, logFailure } from "../shared/utils";
import { ensureUser } from "../shared/users";

/**
 * GET /users/{userId} — the caller's profile. The id in the path is ignored on
 * purpose: the row is read for the token's user, so one account can never read
 * another's balance by guessing an id.
 */
export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return preflight(event);

  const auth = await requireAuth(event.headers);
  if ("statusCode" in auth) return json(event, auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  try {
    const user = await ensureUser(userId);
    return json(event, 200, { id: user.userId, ...user });
  } catch (error: any) {
    logFailure(event, "get_user_failed", error, { userId });
    return json(event, 500, { error: "Get user failed" });
  }
};
