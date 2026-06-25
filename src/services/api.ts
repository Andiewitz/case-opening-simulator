// CS2 API Service
const BASE_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";

let cachedCrates: any[] = [];
let cachedSkins: any[] = [];

export async function getCrates() {
    if (cachedCrates.length > 0) return cachedCrates;
    const res = await fetch(`${BASE_URL}/crates.json`);
    const data = await res.json();
    // Only return cases that contain items
    cachedCrates = data.filter((c: any) => c.type === "Case" && c.contains && c.contains.length > 0);
    return cachedCrates;
}

export async function getSkins() {
    if (cachedSkins.length > 0) return cachedSkins;
    const res = await fetch(`${BASE_URL}/skins.json`);
    cachedSkins = await res.json();
    return cachedSkins;
}

const RARITY_PRICES: Record<string, {min: number, max: number}> = {
    "rarity_common": { min: 0.1, max: 0.5 }, // Consumer
    "rarity_uncommon": { min: 0.2, max: 1 }, // Industrial
    "rarity_rare_weapon": { min: 0.5, max: 5 }, // Mil-Spec
    "rarity_mythical_weapon": { min: 2, max: 15 }, // Restricted
    "rarity_legendary_weapon": { min: 10, max: 50 }, // Classified
    "rarity_ancient_weapon": { min: 30, max: 300 }, // Covert
    "rarity_ancient": { min: 100, max: 1500 }, // Gold / Knife / Gloves
};

export function simulatePriceAndCondition(item: any, isSpecialItem: boolean = false) {
    const rarityId = item.rarity?.id || "rarity_rare_weapon";
    let priceRange = RARITY_PRICES[rarityId] || { min: 0.5, max: 5 };
    
    // Knives/Gloves
    if(isSpecialItem || item.name.includes("★")) {
        priceRange = RARITY_PRICES["rarity_ancient"];
        if (item.name.toLowerCase().includes("butterfly") || item.name.toLowerCase().includes("karambit") || item.name.toLowerCase().includes("m9 bayonet")) {
             priceRange = { min: 500, max: 3000 };
        }
    }

    // Generate accurate float
    // For simplicity we do 0 to 1, but many skins have specific min/max floats.
    // We'll just generate 0 to 1 with standard distribution leaning towards FT.
    let float = 0;
    const conditionRoll = Math.random() * 100;
    let condition = "Field-Tested";
    let condMul = 0.70;
    
    if (conditionRoll <= 3.0) {
        // FN
        float = Math.random() * 0.07;
        condition = "Factory New";
        condMul = 1.0;
    } else if (conditionRoll <= 24.0) {
        // MW
        float = 0.07 + Math.random() * 0.08;
        condition = "Minimal Wear";
        condMul = 0.85;
    } else if (conditionRoll <= 57.0) {
        // FT
        float = 0.15 + Math.random() * 0.23;
        condition = "Field-Tested";
        condMul = 0.70;
    } else if (conditionRoll <= 81.0) {
        // WW
        float = 0.38 + Math.random() * 0.07;
        condition = "Well-Worn";
        condMul = 0.55;
    } else {
        // BS
        float = 0.45 + Math.random() * 0.55;
        condition = "Battle-Scarred";
        condMul = 0.40;
    }
    
    // Pattern 1 - 1000
    const pattern = Math.floor(Math.random() * 1000) + 1;

    let basePrice = (Math.random() * (priceRange.max - priceRange.min)) + priceRange.min;
    
    let finalPrice = basePrice * condMul;
    
    // Check for Blue Gems (Case Hardened)
    if (item.name.includes("Case Hardened")) {
         // Blue gem patterns
         const tier1BlueGemPatterns = [661, 387, 321, 670, 74, 269, 150];
         const tier2BlueGemPatterns = [955, 92, 828, 592, 179, 310, 4];
         if (tier1BlueGemPatterns.includes(pattern)) {
              finalPrice *= 100; // HUGE multiplier for Tier 1
         } else if (tier2BlueGemPatterns.includes(pattern)) {
              finalPrice *= 20; // Big multiplier for Tier 2
         }
    }
    
    // Phase modifiers
    let phase = item.phase;
    if (phase) {
        if (phase === "Emerald" || phase === "Ruby" || phase === "Sapphire") {
             finalPrice *= 8;
        } else if (phase === "Black Pearl") {
             finalPrice *= 5;
        }
    }

    const isStatTrak = Math.random() < 0.1;
    if(isStatTrak) finalPrice *= 2.5;

    return {
        ...item,
        price: parseFloat(finalPrice.toFixed(2)),
        condition,
        isStatTrak,
        float: parseFloat(float.toFixed(4)),
        pattern,
        phase: phase || null
    };
}

export function generateCaseRoll(crate: any) {
    // Probabilities
    // Blue: 79.92%
    // Purple: 15.98%
    // Pink: 3.20%
    // Red: 0.64%
    // Gold: 0.26%
    
    const contains = crate.contains || [];
    const containsRare = crate.contains_rare || [];
    
    const itemsByRarity: Record<string, any[]> = {};
    contains.forEach((i: any) => {
        const rName = i.rarity.name;
        if(!itemsByRarity[rName]) itemsByRarity[rName] = [];
        itemsByRarity[rName].push(i);
    });
    
    const hasRare = containsRare.length > 0;
    
    const roll = Math.random() * 100;
    let selectedItem = null;
    let isSpecialItem = false;
    
    if (roll <= 0.26 && hasRare) {
        // Gold
        selectedItem = containsRare[Math.floor(Math.random() * containsRare.length)];
        selectedItem = {
            ...selectedItem,
            rarity: { id: "rarity_ancient", name: "Rare Special Item", color: "#ffd700" } // Override to GOLD
        };
        isSpecialItem = true;
    } else if (roll <= 0.90 && itemsByRarity["Covert"]) {
        selectedItem = itemsByRarity["Covert"][Math.floor(Math.random() * itemsByRarity["Covert"].length)];
    } else if (roll <= 4.10 && itemsByRarity["Classified"]) {
        selectedItem = itemsByRarity["Classified"][Math.floor(Math.random() * itemsByRarity["Classified"].length)];
    } else if (roll <= 20.08 && itemsByRarity["Restricted"]) {
        selectedItem = itemsByRarity["Restricted"][Math.floor(Math.random() * itemsByRarity["Restricted"].length)];
    } else {
        // Fallback to Mil-Spec or any bottom tier
        const bottomTier = itemsByRarity["Mil-Spec Grade"] || contains;
        if (bottomTier && bottomTier.length > 0) {
             selectedItem = bottomTier[Math.floor(Math.random() * bottomTier.length)];
        }
    }
    
    // In case logic fails, just pick a random one
    if(!selectedItem) {
        selectedItem = contains[Math.floor(Math.random() * contains.length)];
    }

    return simulatePriceAndCondition(selectedItem, isSpecialItem);
}
