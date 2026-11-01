import { docClient, TABLE_USERS, json, requireAuth, corsHeaders } from "../shared/utils";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  const auth = await requireAuth(event.headers);
  if ("statusCode" in auth) return json(auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  try {
    const snap = await docClient.send(
      new GetCommand({ TableName: TABLE_USERS, Key: { userId } })
    );
    let user = snap.Item;
    // Seed the account on first sign-in (starting virtual balance).
    if (!user) {
      const now = new Date().toISOString();
      user = { userId, balance: 100, stats: { casesOpened: 0, totalSpent: 0, totalValue: 0 }, createdAt: now, updatedAt: now };
      await docClient.send(new PutCommand({ TableName: TABLE_USERS, Item: user as any }));
    }
    return json(200, { id: user.userId, ...user } as any);
  } catch (e: any) {
    console.error("GETUSER_FAIL", JSON.stringify({ name: e.name, message: e.message }));
    return json(500, { error: e.message || "Get user failed" });
  }
};
