import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_INVENTORY } from "./utils";

export type InventoryPage = { items: any[]; nextCursor?: string };

/** Newest first. Item ids are `${userId}#${epochMs}#${random}`, so the sort key
 *  orders by creation time; the handler re-sorts the page by createdAt as well. */
export async function listInventory(
  userId: string,
  limit = 100,
  cursor?: string | null
): Promise<InventoryPage> {
  const snap = await docClient.send(
    new QueryCommand({
      TableName: TABLE_INVENTORY,
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      Limit: limit,
      ScanIndexForward: false,
      ExclusiveStartKey: cursor ? { userId, itemId: cursor } : undefined,
    })
  );

  const items = (snap.Items ?? []) as any[];
  const last = snap.LastEvaluatedKey as { itemId?: string } | undefined;

  return { items, nextCursor: last?.itemId };
}

/** Every item held, page by page, capped so a huge inventory cannot blow up. */
export async function listAllInventory(userId: string, max = 500): Promise<any[]> {
  const items: any[] = [];
  let cursor: string | null = null;

  do {
    const page = await listInventory(userId, Math.min(100, max - items.length), cursor);
    items.push(...page.items);
    cursor = page.nextCursor ?? null;
  } while (cursor && items.length < max);

  return items;
}

