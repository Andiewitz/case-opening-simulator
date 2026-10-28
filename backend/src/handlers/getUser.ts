import { docClient, TABLE_USERS, json, requireAuth, corsHeaders } from "../shared/utils";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  const auth = requireAuth(event.headers);
  if ("statusCode" in auth) return json(auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  try {
    const snap = await docClient.send(
      new GetCommand({ TableName: TABLE_USERS, Key: { userId } })
    );
    if (!snap.Item) return json(404, { error: "User not found" });
    return json(200, { id: snap.Item.userId, ...snap.Item });
  } catch (e: any) {
    return json(500, { error: e.message || "Get user failed" });
  }
};
