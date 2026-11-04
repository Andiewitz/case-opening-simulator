export const CSGO_API_BASE = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";

/**
 * Economy constants. The single source of truth for the case price: the API
 * exposes this through GET /config so the storefront and the charge can never
 * disagree (see docs/economy.md).
 */
export const CASE_COST = 2.5;

/** Virtual balance granted when an account row is first created. */
export const STARTING_BALANCE = 100;

/** Hard cap on items held, so one account cannot grow unbounded. */
export const MAX_INVENTORY_ITEMS = 500;

/**
 * Minimum milliseconds between two opens for the same account. The open
 * animation is ~11s, so this only catches double-clicks, retries and scripted
 * abuse. Set OPEN_COOLDOWN_MS=0 to disable (tests do this when they exercise
 * the balance guard rather than the throttle).
 */
export function openCooldownMs(): number {
  const raw = process.env.OPEN_COOLDOWN_MS;
  if (raw === undefined || raw === "") return 400;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 400;
}

/**
 * Browser origins allowed to call the API. Set ALLOWED_ORIGINS in
 * terraform/lambda.tf (comma-separated). "*" is honoured for local testing but
 * must never be used in a deployment that holds real balances.
 */
export function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return ["http://localhost:3000"];
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
