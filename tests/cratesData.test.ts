import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { projectCrate, projectCrates, projectItem } from "../backend/src/shared/cratesData";

const IMAGE_PREFIX = "https://community.akamai.steamstatic.com/economy/image/";

describe("projectItem", () => {
  it("strips the Steam CDN prefix so the payload stays small", () => {
    const item = projectItem({
      id: "item-1",
      name: "MP7 | Skulls",
      image: `${IMAGE_PREFIX}-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpo`,
      rarity: { id: "rarity_rare_weapon", name: "Mil-Spec Grade", color: "#4b69ff", extra: "dropped" },
    });

    expect(item.image).toBe(
      "-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpo"
    );
    expect(item.rarity).toEqual({ id: "rarity_rare_weapon", name: "Mil-Spec Grade", color: "#4b69ff" });
  });

  it("is idempotent on an already-stripped hash", () => {
    const hash = "-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo";
    expect(projectItem({ id: "x", name: "x", image: hash }).image).toBe(hash);
  });

  it("keeps non-Steam absolute URLs untouched", () => {
    const url = "https://example.com/art.png";
    expect(projectItem({ id: "x", name: "x", image: url }).image).toBe(url);
  });

  it("tolerates missing rarity and image", () => {
    expect(projectItem({ id: "x", name: "x" })).toMatchObject({ id: "x", name: "x" });
  });
});

describe("projectCrates", () => {
  const raw = [
    { id: "case-1", name: "Case", type: "Case", image: "c.png", contains: [{ id: "i1", name: "Item" }], contains_rare: [] },
    { id: "stick-1", name: "Sticker Capsule", type: "Sticker Capsule", image: "s.png", contains: [{ id: "i2", name: "Sticker" }] },
    { id: "auto-1", name: "Autograph Capsule", type: "Autograph Capsule", image: "a.png", contains: [{ id: "i3", name: "Sig" }] },
    { id: "graffiti-1", name: "Graffiti Box", type: "Graffiti Box", image: "g.png", contains: [{ id: "i4", name: "Spray" }] },
    { id: "empty-1", name: "Empty Case", type: "Case", image: "e.png", contains: [] },
    { id: "none-1", name: "No Items", type: "Case", image: "n.png" },
  ];

  it("keeps only supported containers that actually contain items", () => {
    const ids = projectCrates(raw).map((crate) => crate.id);
    expect(ids).toEqual(["case-1", "stick-1", "auto-1"]);
  });

  it("preserves the fields the UI reads", () => {
    const [crate] = projectCrates(raw);
    expect(crate).toMatchObject({ id: "case-1", name: "Case", type: "Case", image: "c.png" });
    expect(crate.contains).toHaveLength(1);
    expect(crate.contains_rare).toEqual([]);
  });

  it("always emits both item arrays", () => {
    for (const crate of projectCrates(raw)) {
      expect(Array.isArray(crate.contains)).toBe(true);
      expect(Array.isArray(crate.contains_rare)).toBe(true);
    }
  });

  it("projects items through projectItem", () => {
    const crate = projectCrate({
      id: "c",
      name: "C",
      type: "Case",
      image: "c.png",
      contains: [{ id: "i", name: "I", image: IMAGE_PREFIX + "hash" }],
    });
    expect(crate.contains[0].image).toBe("hash");
  });
});

describe("baked snapshot", () => {
  const path = resolve(process.cwd(), "backend/src/shared/crates.json.gz");

  it("exists in the repo and parses to a non-empty crate list", () => {
    expect(existsSync(path)).toBe(true);
    const crates = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
    expect(Array.isArray(crates)).toBe(true);
    expect(crates.length).toBeGreaterThan(20);
    for (const crate of crates.slice(0, 25)) {
      expect(typeof crate.id).toBe("string");
      expect(typeof crate.name).toBe("string");
      expect(Array.isArray(crate.contains)).toBe(true);
      expect(crate.contains.length).toBeGreaterThan(0);
    }
  });
});
