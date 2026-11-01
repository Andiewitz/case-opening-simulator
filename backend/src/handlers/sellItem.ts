import { docClient, TABLE_USERS, TABLE_INVENTORY, json, requireAuth, corsHeaders } from "../shared/utils";
import { GetCommand, DeleteCommand, UpdateCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

  const auth = await requireAuth(event.headers);
  if ("statusCode" in auth) return json(auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { itemId } = body;
  if (!itemId) return json(400, { error: "Missing itemId" });

  try {
    const itemSnap = await docClient.send(
      new GetCommand({ TableName: TABLE_INVENTORY, Key: { userId, itemId } })
    );
    if (!itemSnap.Item) return json(404, { error: "Item not found" });
    const item = itemSnap.Item as any;
    if (item.userId !== userId) return json(403, { error: "Not your item" });

    const userSnap = await docClient.send(
      new GetCommand({ TableName: TABLE_USERS, Key: { userId } })
    );
    if (!userSnap.Item) return json(404, { error: "User not found" });
    const user = userSnap.Item as any;

    const price = item.price || 0;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Delete: { TableName: TABLE_INVENTORY, Key: { userId, itemId } } },
          {
            Update: {
              TableName: TABLE_USERS,
              Key: { userId },
              UpdateExpression: "SET balance = :bal, updatedAt = :ua",
              ExpressionAttributeValues: {
                ":bal": user.balance + price,
                ":ua": new Date().toISOString(),
              },
            },
          },
        ],
      })
    );

    return json(200, { sold: true, price, itemId });
  } catch (e: any) {
    return json(500, { error: e.message || "Sell failed" });
  }
};
