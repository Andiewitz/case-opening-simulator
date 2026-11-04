import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { allowedOrigins } from "../config";

const ddbClient = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(ddbClient);

const cognitoClient = new CognitoIdentityProviderClient({});

export const TABLE_USERS = process.env.TABLE_USERS || "cs2-unboxed-users-dev";
export const TABLE_INVENTORY = process.env.TABLE_INVENTORY || "cs2-unboxed-inventory-items-dev";

type Headers = Record<string, string | undefined> | undefined;

function headerValue(headers: Headers, name: string): string | undefined {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

/**
 * CORS headers for a specific request. The API carries bearer tokens, so it
 * never answers with a wildcard origin: only configured origins are echoed
 * back, and unknown origins get no Access-Control-Allow-Origin at all.
 */
export function corsHeaders(event: any): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };

  const origin = headerValue(event?.headers, "origin");
  if (!origin) return base;

  const allowed = allowedOrigins();
  if (allowed.includes("*") || allowed.includes(origin)) {
    return { ...base, "Access-Control-Allow-Origin": origin };
  }
  return base;
}

/** True when a state-changing request comes from a browser origin we do not trust. */
export function originDenied(event: any): boolean {
  const origin = headerValue(event?.headers, "origin");
  if (!origin) return false; // non-browser caller (curl, tests, server-to-server)
  const allowed = allowedOrigins();
  return !(allowed.includes("*") || allowed.includes(origin));
}

export function preflight(event: any) {
  return { statusCode: 200, headers: corsHeaders(event), body: "" };
}

export function json(event: any, statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { ...corsHeaders(event), "Cache-Control": "no-store" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

/**
 * Structured JSON log line. CloudWatch Logs Insights can query these fields
 * directly, and the request id ties a line to an API Gateway request.
 */
export function logEvent(
  level: "info" | "warn" | "error",
  name: string,
  event: any,
  fields: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({
    level,
    name,
    requestId: event?.requestContext?.requestId ?? null,
    route: event?.resource ?? null,
    ...fields,
    ts: new Date().toISOString(),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Logs a handler failure with the fields that make it diagnosable. */
export function logFailure(event: any, name: string, error: any, fields: Record<string, unknown> = {}) {
  logEvent("error", name, event, {
    error: error?.name ?? "Error",
    message: error?.message ?? String(error),
    ...fields,
  });
}

export async function getUserIdFromAccessToken(accessToken: string): Promise<string> {
  const out = await cognitoClient.send(new GetUserCommand({ AccessToken: accessToken }));
  // Cognito returns Username as the sub/userId
  return out.Username!;
}

export function getBearerToken(headers: Headers): string | null {
  const auth = headerValue(headers, "authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function requireAuth(
  headers: Headers
): Promise<{ userId: string } | { statusCode: number; body: string }> {
  const token = getBearerToken(headers);
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Missing or invalid Authorization header" }) };
  }
  try {
    const userId = await getUserIdFromAccessToken(token);
    return { userId };
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid or expired token" }) };
  }
}

/** Parses a JSON request body, returning null when it is malformed. */
export function parseBody(event: any): any | null {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return null;
  }
}
