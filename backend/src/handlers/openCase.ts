import { docClient, TABLE_USERS, TABLE_INVENTORY, json, requireAuth, corsHeaders } from "../shared/utils";
import { GetCommand, PutCommand, UpdateCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { generateCaseRoll } from "../shared/simulation";
import { CASE_COST } from "../config";

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

  const { crateId } = body;
  if (!crateId) return json(400, { error: "Missing crateId" });

  try {
    const userSnap = await docClient.send(
      new GetCommand({ TableName: TABLE_USERS, Key: { userId } })
    );
    if (!userSnap.Item) return json(404, { error: "User not found" });
    const user = userSnap.Item as any;
    if (user.balance < CASE_COST) return json(400, { error: "Insufficient balance" });

    const res = await fetch(`https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json`);
    const crates = await res.json();
    const crate = crates.find((c: any) => c.id === crateId);
    if (!crate) return json(404, { error: "Crate not found" });

    const winner = generateCaseRoll(crate);

    const itemId = `${userId}#${Date.now()}#${Math.random().toString(36).slice(2)}`;
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
      createdAt: new Date().toISOString(),
    };

    const stats = user.stats || {};
    const transactItems = [
      { Put: { TableName: TABLE_INVENTORY, Item: newItem } },
      {
        Update: {
          TableName: TABLE_USERS,
          Key: { userId },
          UpdateExpression:
            "SET balance = :bal, stats.casesOpened = :co, stats.totalSpent = :ts, stats.totalValue = :tv, updatedAt = :ua",
          ExpressionAttributeValues: {
            ":bal": user.balance - CASE_COST,
            ":co": (stats.casesOpened || 0) + 1,
            ":ts": (stats.totalSpent || 0) + CASE_COST,
            ":tv": (stats.totalValue || 0) + (winner.price || 0),
            ":ua": new Date().toISOString(),
          },
        },
      },
    ];

    await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

    return json(200, { id: itemId, ...newItem });
  } catch (e: any) {
    return json(500, { error: e.message || "Open case failed" });
  }
};
