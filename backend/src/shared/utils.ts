import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const ddbClient = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(ddbClient);

const cognitoClient = new CognitoIdentityProviderClient({});

export const TABLE_USERS = process.env.TABLE_USERS!;
export const TABLE_INVENTORY = process.env.TABLE_INVENTORY!;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: corsHeaders,
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

export async function getUserIdFromAccessToken(accessToken: string): Promise<string> {
  const out = await cognitoClient.send(
    new GetUserCommand({ AccessToken: accessToken })
  );
  // Cognito returns Username as the sub/userId
  return out.Username!;
}

export function getBearerToken(headers: Record<string, string | undefined> | undefined): string | null {
  const auth = headers?.authorization || headers?.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function requireAuth(headers: Record<string, string | undefined> | undefined): Promise<{ userId: string } | { statusCode: number; body: string }> {
  const token = getBearerToken(headers);
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Missing or invalid Authorization header" }) };
  }
  try {
    const userId = await getUserIdFromAccessToken(token);
    return { userId };
  } catch (e) {
    return { statusCode: 401, body: JSON.stringify({ error: "Invalid or expired token" }) };
  }
}
