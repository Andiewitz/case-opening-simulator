import type { Rng } from "../../backend/src/shared/simulation";

/** Always returns the same value. */
export function fixedRng(value: number): Rng {
  return () => value;
}

/** Returns the given values in order, then repeats the last one. */
export function sequenceRng(...values: number[]): Rng {
  let index = 0;
  const last = values[values.length - 1] ?? 0.5;
  return () => (index < values.length ? values[index++] : last);
}

/** Deterministic PRNG (mulberry32) for statistical assertions. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RARITY = {
  blue: { id: "rarity_rare_weapon", name: "Mil-Spec Grade", color: "#4b69ff" },
  purple: { id: "rarity_mythical_weapon", name: "Restricted", color: "#8847ff" },
  pink: { id: "rarity_legendary_weapon", name: "Classified", color: "#d32ce6" },
  red: { id: "rarity_ancient_weapon", name: "Covert", color: "#eb4b4b" },
};

export const FIXTURE_CRATE = {
  id: "crate-test",
  name: "Test Case",
  type: "Case",
  image: "case.png",
  contains: [
    { id: "blue-1", name: "MP7 | Skulls", image: "blue.png", rarity: RARITY.blue },
    { id: "purple-1", name: "AK-47 | Neon Rider", image: "purple.png", rarity: RARITY.purple },
    { id: "pink-1", name: "M4A4 | The Emperor", image: "pink.png", rarity: RARITY.pink },
    { id: "red-1", name: "AWP | Dragon Lore", image: "red.png", rarity: RARITY.red },
  ],
  contains_rare: [
    { id: "knife-1", name: "★ Karambit | Doppler", image: "knife.png", rarity: RARITY.red },
  ],
};

export const FIXTURE_CRATES = [FIXTURE_CRATE];

/** A crate with no Covert/Classified/Restricted tiers, to exercise fallbacks. */
export const BLUE_ONLY_CRATE = {
  id: "crate-blue",
  name: "Blue Only",
  type: "Case",
  image: "case.png",
  contains: [{ id: "blue-1", name: "MP7 | Skulls", image: "blue.png", rarity: RARITY.blue }],
  contains_rare: [],
};
