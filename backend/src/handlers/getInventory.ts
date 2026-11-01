import { docClient, TABLE_INVENTORY, json, requireAuth, corsHeaders } from "../shared/utils";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  const auth = await requireAuth(event.headers);
  if ("statusCode" in auth) return json(auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  try {
    const snap = await docClient.send(
      new QueryCommand({
        TableName: TABLE_INVENTORY,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
      })
    );
    const items = (snap.Items || []).sort(
      (a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    return json(200, items);
  } catch (e: any) {
    return json(500, { error: e.message || "Get inventory failed" });
  }
};
