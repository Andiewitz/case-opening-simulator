import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import {
  docClient,
  TABLE_USERS,
  TABLE_INVENTORY,
  json,
  preflight,
  originDenied,
  requireAuth,
  parseBody,
  logEvent,
  logFailure,
} from "../shared/utils";
import { ensureUser } from "../shared/users";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return preflight(event);
  if (originDenied(event)) return json(event, 403, { error: "Origin not allowed" });

  const auth = await requireAuth(event.headers);
  if ("statusCode" in auth) return json(event, auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  const body = parseBody(event);
  if (!body) return json(event, 400, { error: "Invalid JSON body" });

  const { itemId } = body;
  if (!itemId || typeof itemId !== "string") return json(event, 400, { error: "Missing itemId" });

  try {
    // Repairs legacy rows so inventoryCount always exists before a decrement.
    await ensureUser(userId);

    // The price always comes from the stored item, never from the request body.
    const itemSnap = await docClient.send(
      new GetCommand({ TableName: TABLE_INVENTORY, Key: { userId, itemId } })
    );
    if (!itemSnap.Item) return json(event, 404, { error: "Item not found" });

    const price = Number((itemSnap.Item as any).price) || 0;

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            // Deleting on a condition makes a double-sell impossible: the second
            // request cannot delete a row that is already gone.
            Delete: {
              TableName: TABLE_INVENTORY,
              Key: { userId, itemId },
              ConditionExpression: "attribute_exists(itemId)",
            },
          },
          {
            Update: {
              TableName: TABLE_USERS,
              Key: { userId },
              UpdateExpression:
                "ADD balance :price, inventoryCount :negOne SET updatedAt = :ua",
              ConditionExpression: "attribute_exists(userId)",
              ExpressionAttributeValues: {
                ":price": price,
                ":negOne": -1,
                ":ua": new Date().toISOString(),
              },
            },
          },
        ],
      })
    );

    logEvent("info", "sell_item", event, { userId, itemId, price });
    return json(event, 200, { sold: true, price, itemId });
  } catch (error: any) {
    if (error?.name === "TransactionCanceledException" || error?.name === "ConditionalCheckFailedException") {
      return json(event, 409, { error: "Item was already sold", code: "ALREADY_SOLD" });
    }
    logFailure(event, "sell_item_failed", error, { userId, itemId });
    return json(event, 500, { error: "Sell failed" });
  }
};
