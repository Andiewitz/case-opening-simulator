import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_INVENTORY, TABLE_USERS } from "./utils";
import { MAX_INVENTORY_ITEMS, STARTING_BALANCE } from "../config";

export type UserStats = { casesOpened: number; totalSpent: number; totalValue: number };

export type UserRecord = {
  userId: string;
  balance: number;
  inventoryCount: number;
  stats: UserStats;
  createdAt: string;
  updatedAt: string;
  lastOpenAt?: number;
};

function defaultStats(): UserStats {
  return { casesOpened: 0, totalSpent: 0, totalValue: 0 };
}

/**
 * Counts held items, page by page. DynamoDB caps a Query response at 1 MB, so a
 * single call silently under-reports a large inventory. `max` bounds the walk.
 */
export async function countInventory(userId: string, max = MAX_INVENTORY_ITEMS): Promise<number> {
  let count = 0;
  let cursor: Record<string, any> | undefined;

  do {
    const snap = await docClient.send(
      new QueryCommand({
        TableName: TABLE_INVENTORY,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        Select: "COUNT",
        ExclusiveStartKey: cursor,
      })
    );
    count += snap.Count ?? 0;
    cursor = snap.LastEvaluatedKey as Record<string, any> | undefined;
  } while (cursor && count < max);

  return count;
}

/**
 * Returns the account row, creating it on first use.
 *
 * Both openCase and sellItem need this: relying on the client to call GET /users
 * first meant a brand-new account hit `404 User not found` on its first open
 * (see docs/plan.md F8). Seeding is guarded by `attribute_not_exists` so two
 * concurrent first requests cannot double-seed.
 *
 * Legacy rows written before `inventoryCount`/`stats` existed are repaired in
 * place; that repair touches no money fields.
 */
export async function ensureUser(userId: string): Promise<UserRecord> {
  const snap = await docClient.send(new GetCommand({ TableName: TABLE_USERS, Key: { userId } }));

  if (!snap.Item) {
    const now = new Date().toISOString();
    const user: UserRecord = {
      userId,
      balance: STARTING_BALANCE,
      inventoryCount: 0,
      stats: defaultStats(),
      createdAt: now,
      updatedAt: now,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_USERS,
          Item: user,
          ConditionExpression: "attribute_not_exists(userId)",
        })
      );
      return user;
    } catch (error: any) {
      if (error?.name !== "ConditionalCheckFailedException") throw error;
      // Another request seeded it between our read and write — use that row.
      const raced = await docClient.send(
        new GetCommand({ TableName: TABLE_USERS, Key: { userId } })
      );
      if (!raced.Item) throw error;
      return repairUser(raced.Item as UserRecord);
    }
  }

  return repairUser(snap.Item as UserRecord);
}

async function repairUser(user: UserRecord): Promise<UserRecord> {
  const reparsed: UserRecord = { ...user };

  if (!reparsed.stats || typeof reparsed.stats !== "object") {
    reparsed.stats = defaultStats();
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_USERS,
        Key: { userId: reparsed.userId },
        UpdateExpression: "SET stats = :stats",
        ExpressionAttributeValues: { ":stats": reparsed.stats },
      })
    );
  }

  if (typeof reparsed.inventoryCount !== "number") {
    reparsed.inventoryCount = await countInventory(reparsed.userId);
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_USERS,
        Key: { userId: reparsed.userId },
        UpdateExpression: "SET inventoryCount = :count",
        ExpressionAttributeValues: { ":count": reparsed.inventoryCount },
      })
    );
  }

  return reparsed;
}
