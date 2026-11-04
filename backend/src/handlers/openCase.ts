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
import { generateCaseRoll } from "../shared/simulation";
import { loadCrates } from "../shared/crates";
import { CASE_COST, MAX_INVENTORY_ITEMS, openCooldownMs } from "../config";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return preflight(event);
  if (originDenied(event)) return json(event, 403, { error: "Origin not allowed" });

  const auth = await requireAuth(event.headers);
  if ("statusCode" in auth) return json(event, auth.statusCode, JSON.parse(auth.body));
  const { userId } = auth;

  const body = parseBody(event);
  if (!body) return json(event, 400, { error: "Invalid JSON body" });

  const { crateId, warmup } = body;
  if (!crateId && warmup !== true) return json(event, 400, { error: "Missing crateId" });

  const cooldown = openCooldownMs();

  try {
    // Seeds the account on first use (F8) and warms the DynamoDB connection on a
    // cold container. The warm-up request from the case page establishes the
    // Cognito + DynamoDB + crate-pool path before the user clicks Open.
    const user = await ensureUser(userId);

    if (warmup === true) {
      await loadCrates();
      return json(event, 200, { warm: true });
    }

    if (typeof crateId !== "string") return json(event, 400, { error: "Missing crateId" });

    // Fast, friendly rejections. These are advisory only — the transaction below
    // is what actually enforces them, so a race between the read and the write
    // cannot overdraw the account.
    if (typeof user.balance !== "number" || user.balance < CASE_COST) {
      return json(event, 409, { error: "Insufficient balance", code: "INSUFFICIENT_BALANCE" });
    }
    if ((user.inventoryCount ?? 0) >= MAX_INVENTORY_ITEMS) {
      return json(event, 409, {
        error: "Inventory is full — sell some items first",
        code: "INVENTORY_FULL",
      });
    }
    if (cooldown > 0 && user.lastOpenAt && Date.now() - user.lastOpenAt < cooldown) {
      return json(event, 429, { error: "Slow down — one open at a time", code: "TOO_FAST" });
    }

    const crates = await loadCrates();
    const crate = crates.find((c: any) => c.id === crateId);
    if (!crate) return json(event, 404, { error: "Crate not found" });

    const winner = generateCaseRoll(crate);

    const now = Date.now();
    const itemId = `${userId}#${now}#${Math.random().toString(36).slice(2)}`;
    const rarityName = winner.rarity?.name || winner.rarity || "Base Grade";
    const colorHex = winner.rarity?.color || winner.color || "#b0c3d9";

    const newItem = {
      itemId,
      userId,
      name: winner.name,
      rarity: rarityName,
      color: colorHex,
      image: winner.image || "",
      price: winner.price || 0,
      condition: winner.condition || "Factory New",
      isStatTrak: winner.isStatTrak || false,
      pattern: winner.pattern || 1,
      float: winner.float || 0.05,
      phase: winner.phase || null,
      createdAt: new Date(now).toISOString(),
    };

    // Money moves with a relative ADD guarded by a condition — never
    // `SET balance = <value computed from a stale read>`. See docs/plan.md F7.
    const conditions = [
      "balance >= :cost",
      "(attribute_not_exists(inventoryCount) OR inventoryCount < :cap)",
    ];
    const values: Record<string, any> = {
      ":cost": CASE_COST,
      ":cap": MAX_INVENTORY_ITEMS,
      ":negCost": -CASE_COST,
      ":one": 1,
      ":value": newItem.price,
      ":now": now,
      ":ua": new Date(now).toISOString(),
    };
    if (cooldown > 0) {
      conditions.push("(attribute_not_exists(lastOpenAt) OR lastOpenAt < :gap)");
      values[":gap"] = now - cooldown;
    }

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: TABLE_INVENTORY, Item: newItem } },
          {
            Update: {
              TableName: TABLE_USERS,
              Key: { userId },
              UpdateExpression:
                "ADD balance :negCost, inventoryCount :one, stats.casesOpened :one, " +
                "stats.totalSpent :cost, stats.totalValue :value " +
                "SET lastOpenAt = :now, updatedAt = :ua",
              ConditionExpression: conditions.join(" AND "),
              ExpressionAttributeValues: values,
            },
          },
        ],
      })
    );

    logEvent("info", "open_case", event, {
      userId,
      crateId,
      itemId,
      rarity: rarityName,
      price: newItem.price,
    });

    return json(event, 200, { id: itemId, ...newItem });
  } catch (error: any) {
    if (error?.name === "TransactionCanceledException") {
      // A concurrent open/sell changed the account between our read and the
      // write. Nothing was written; the client may retry.
      logEvent("warn", "open_case_conflict", event, { userId, crateId });
      return json(event, 409, {
        error: "Could not complete the open — please try again",
        code: "CONFLICT",
      });
    }
    logFailure(event, "open_case_failed", error, { userId, crateId });
    return json(event, 500, { error: "Open case failed" });
  }
};
