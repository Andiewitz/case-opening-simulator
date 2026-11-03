/**
 * Projection helpers for the upstream CSGO-API crates feed.
 *
 * This module is shared by the Lambda runtime and the build-time snapshot
 * script so both always produce exactly the same shape.
 */

const IMAGE_PREFIX = "https://community.akamai.steamstatic.com/economy/image/";

export function projectItem(i: any) {
  return {
    id: i.id,
    name: i.name,
    // Compact Steam CDN hash — the full ~250-char URL prefix would add
    // megabytes across 281 cases; clients rebuild it via src/lib/steam.ts.
    image: i.image ? i.image.replace(IMAGE_PREFIX, "") : i.image,
    rarity: i.rarity ? { id: i.rarity.id, name: i.rarity.name, color: i.rarity.color } : undefined,
    phase: i.phase,
  };
}

export function projectCrate(c: any) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    image: c.image,
    contains: (c.contains || []).map(projectItem),
    contains_rare: (c.contains_rare || []).map(projectItem),
  };
}

export function projectCrates(data: any[]): any[] {
  return data
    .filter(
      (c: any) =>
        (c.type === "Case" || c.type === "Sticker Capsule" || c.type === "Autograph Capsule") &&
        c.contains &&
        c.contains.length > 0
    )
    .map(projectCrate);
}
