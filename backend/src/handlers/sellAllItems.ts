import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
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
import { listAllInventory } from "../shared/inventory";
import { MAX_INVENTORY_ITEMS } from "../config";

// DynamoDB transactions accept at most 100 actions; one is the user update.
const CHUNK = 99;

/**
 * POST /inventory/sell-all — sells every item the caller holds.
 *
 * Replaces the client-side loop that issued one request per item (F13): that
 * path cost N invocations and left the inventory half-sold when a request in
 * the middle failed. Each chunk is a single transaction, so a chunk is either
 * fully sold or untouched. `soldItemIds` in the response tells the client
 * exactly what changed, even if a later chunk failed.
 */
export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return preflight(event);
  if (originDenied(event)) return json(event, 403, { error: "Origin not allowed" });

  const auth = await requireAuth(event.headers);
  if ("statusCode" in auth) return json(event, auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  const body = parseBody(event);
  if (!body) return json(event, 400, { error: "Invalid JSON body" });

  try {
    await ensureUser(userId);

    const all = await listAllInventory(userId, MAX_INVENTORY_ITEMS);
    if (all.length === 0) {
      return json(event, 200, { sold: 0, total: 0, soldItemIds: [] });
    }

    const soldItemIds: string[] = [];
    let total = 0;

    for (let i = 0; i < all.length; i += CHUNK) {
      const chunk = all.slice(i, i + CHUNK);
      const chunkTotal = chunk.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            ...chunk.map((item) => ({
              Delete: {
                TableName: TABLE_INVENTORY,
                Key: { userId, itemId: item.itemId },
                ConditionExpression: "attribute_exists(itemId)",
              },
            })),
            {
              Update: {
                TableName: TABLE_USERS,
                Key: { userId },
                UpdateExpression:
                  "ADD balance :total, inventoryCount :negCount SET updatedAt = :ua",
                ConditionExpression: "attribute_exists(userId)",
                ExpressionAttributeValues: {
                  ":total": Number(chunkTotal.toFixed(2)),
                  ":negCount": -chunk.length,
                  ":ua": new Date().toISOString(),
                },
              },
            },
          ],
        })
      );

      soldItemIds.push(...chunk.map((item) => item.itemId));
      total += chunkTotal;
    }

    logEvent("info", "sell_all_items", event, {
      userId,
      count: soldItemIds.length,
      total: Number(total.toFixed(2)),
    });

    return json(event, 200, {
      sold: soldItemIds.length,
      total: Number(total.toFixed(2)),
      soldItemIds,
    });
  } catch (error: any) {
    if (error?.name === "TransactionCanceledException") {
      // One item in a chunk was sold by a parallel request; nothing in that
      // chunk changed. Report it so the client can refresh and retry.
      logEvent("warn", "sell_all_conflict", event, { userId });
      return json(event, 409, {
        error: "Your inventory changed while selling — refresh and try again",
        code: "CONFLICT",
      });
    }
    logFailure(event, "sell_all_failed", error, { userId });
    return json(event, 500, { error: "Sell all failed" });
  }
};
