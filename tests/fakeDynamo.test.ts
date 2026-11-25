import { describe, expect, it } from "vitest";
import { FakeDynamo } from "./helpers/fakeDynamo";

const schema = { "t": ["userId", "itemId"] };

describe("FakeDynamo real DynamoDB limits", () => {
  it("rejects a transaction with more than 100 actions", () => {
    const db = new FakeDynamo(schema);
    const items = Array.from({ length: 101 }, (_, i) => ({
      Put: { TableName: "t", Item: { userId: "u", itemId: String(i) } },
    }));

    expect(() => db.transact(items)).toThrowError(/more than 100 actions/);
  });

  it("accepts a transaction at exactly 100 actions", () => {
    const db = new FakeDynamo(schema);
    const items = Array.from({ length: 100 }, (_, i) => ({
      Put: { TableName: "t", Item: { userId: "u", itemId: String(i) } },
    }));

    expect(() => db.transact(items)).not.toThrow();
  });

  it("rejects an item larger than 400 KB", () => {
    const db = new FakeDynamo(schema);
    const big = { userId: "u", itemId: "1", blob: "x".repeat(400 * 1024 + 10) };

    expect(() => db.put({ TableName: "t", Item: big })).toThrowError(/exceeds the .*limit/);
  });

  it("accepts an item just under 400 KB", () => {
    const db = new FakeDynamo(schema);
    const ok = { userId: "u", itemId: "1", blob: "x".repeat(1000) };

    expect(() => db.put({ TableName: "t", Item: ok })).not.toThrow();
  });
});