const RARITY_PRICES: Record<string, { min: number; max: number }> = {
  rarity_common: { min: 0.1, max: 0.5 },
  rarity_uncommon: { min: 0.2, max: 1 },
  rarity_rare_weapon: { min: 0.5, max: 5 },
  rarity_rare: { min: 0.2, max: 3 },
  rarity_mythical_weapon: { min: 2, max: 15 },
  rarity_mythical: { min: 1, max: 10 },
  rarity_legendary_weapon: { min: 10, max: 50 },
  rarity_legendary: { min: 5, max: 30 },
  rarity_ancient_weapon: { min: 30, max: 300 },
  rarity_ancient: { min: 100, max: 1500 },
};

const TIER1_BLUE_GEM_PATTERNS = [661, 387, 321, 670, 74, 269, 150];
const TIER2_BLUE_GEM_PATTERNS = [955, 92, 828, 592, 179, 310, 4];

export function simulatePriceAndCondition(item: any, isSpecialItem = false) {
  const rarityId = item.rarity?.id || "rarity_rare_weapon";
  let priceRange = RARITY_PRICES[rarityId] || { min: 0.5, max: 5 };

  if (isSpecialItem || item.name?.includes("★")) {
    priceRange = RARITY_PRICES["rarity_ancient"];
    const nameL = item.name.toLowerCase();
    if (nameL.includes("butterfly") || nameL.includes("karambit") || nameL.includes("m9 bayonet")) {
      priceRange = { min: 500, max: 3000 };
    }
  }

  let basePrice = Math.random() * (priceRange.max - priceRange.min) + priceRange.min;

  const isSticker =
    item.id?.startsWith("sticker-") ||
    item.id?.startsWith("patch-") ||
    item.id?.startsWith("graffiti-");

  if (isSticker) {
    return {
      ...item,
      price: parseFloat(basePrice.toFixed(2)),
      condition: null,
      isStatTrak: false,
      float: null,
      pattern: null,
      phase: null,
    };
  }

  let float = 0;
  const conditionRoll = Math.random() * 100;
  let condition = "Field-Tested";
  let condMul = 0.70;

  if (conditionRoll <= 3.0) {
    float = Math.random() * 0.07;
    condition = "Factory New";
    condMul = 1.0;
  } else if (conditionRoll <= 24.0) {
    float = 0.07 + Math.random() * 0.08;
    condition = "Minimal Wear";
    condMul = 0.85;
  } else if (conditionRoll <= 57.0) {
    float = 0.15 + Math.random() * 0.23;
    condition = "Field-Tested";
    condMul = 0.70;
  } else if (conditionRoll <= 81.0) {
    float = 0.38 + Math.random() * 0.07;
    condition = "Well-Worn";
    condMul = 0.55;
  } else {
    float = 0.45 + Math.random() * 0.55;
    condition = "Battle-Scarred";
    condMul = 0.40;
  }

  const pattern = Math.floor(Math.random() * 1000) + 1;
  let finalPrice = basePrice * condMul;

  if (item.name?.includes("Case Hardened")) {
    if (TIER1_BLUE_GEM_PATTERNS.includes(pattern)) {
      finalPrice *= 100;
    } else if (TIER2_BLUE_GEM_PATTERNS.includes(pattern)) {
      finalPrice *= 20;
    }
  }

  let phase = item.phase;
  if (phase) {
    if (phase === "Emerald" || phase === "Ruby" || phase === "Sapphire") {
      finalPrice *= 8;
    } else if (phase === "Black Pearl") {
      finalPrice *= 5;
    }
  }

  const isStatTrak = Math.random() < 0.1;
  if (isStatTrak) finalPrice *= 2.5;

  return {
    ...item,
    price: parseFloat(finalPrice.toFixed(2)),
    condition,
    isStatTrak,
    float: parseFloat(float.toFixed(4)),
    pattern,
    phase: phase || null,
  };
}

export function generateCaseRoll(crate: any) {
  const contains = crate.contains || [];
  const containsRare = crate.contains_rare || [];

  const itemsByRarity: Record<string, any[]> = {};
  contains.forEach((i: any) => {
    const rName = i.rarity?.name;
    if (!itemsByRarity[rName]) itemsByRarity[rName] = [];
    itemsByRarity[rName].push(i);
  });

  const hasRare = containsRare.length > 0;

  const roll = Math.random() * 100;
  let selectedItem = null;
  let isSpecialItem = false;

  const redTier = itemsByRarity["Covert"] || itemsByRarity["Extraordinary"] || [];
  const pinkTier = itemsByRarity["Classified"] || itemsByRarity["Exotic"] || [];
  const purpleTier =
    itemsByRarity["Restricted"] ||
    itemsByRarity["Remarkable"] ||
    itemsByRarity["High Grade (Purple)"] ||
    [];
  const blueTier =
    itemsByRarity["Mil-Spec Grade"] ||
    itemsByRarity["High Grade"] ||
    itemsByRarity["Industrial Grade"] ||
    itemsByRarity["Consumer Grade"] ||
    itemsByRarity["Base Grade"] ||
    contains;

  if (roll <= 0.26 && hasRare) {
    selectedItem = containsRare[Math.floor(Math.random() * containsRare.length)];
    selectedItem = {
      ...selectedItem,
      rarity: { id: "rarity_ancient", name: "Rare Special Item", color: "#ffd700" },
    };
    isSpecialItem = true;
  } else if (roll <= 0.90 && redTier.length > 0) {
    selectedItem = redTier[Math.floor(Math.random() * redTier.length)];
  } else if (roll <= 4.10 && pinkTier.length > 0) {
    selectedItem = pinkTier[Math.floor(Math.random() * pinkTier.length)];
  } else if (roll <= 20.08 && purpleTier.length > 0) {
    selectedItem = purpleTier[Math.floor(Math.random() * purpleTier.length)];
  } else {
    if (blueTier && blueTier.length > 0) {
      selectedItem = blueTier[Math.floor(Math.random() * blueTier.length)];
    }
  }

  if (!selectedItem) {
    selectedItem = contains[Math.floor(Math.random() * contains.length)];
  }

  return simulatePriceAndCondition(selectedItem, isSpecialItem);
}
