import { useEffect, useState } from "react";
import { getConfig, type EconomyConfig } from "../services/api";

// The config is small and changes rarely; one fetch per page load, shared by
// every consumer, keeps the storefront and the case page on the same numbers.
let cached: EconomyConfig | null = null;
let inFlight: Promise<EconomyConfig> | null = null;

function load(): Promise<EconomyConfig> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = getConfig()
      .then((config) => {
        cached = config;
        return config;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Test seam: forget the cached config between test cases. */
export function resetEconomyCache(): void {
  cached = null;
  inFlight = null;
}

/**
 * Reads the economy settings from GET /config. `caseCost` stays null until the
 * server answers, which lets the UI avoid showing a price it invented
 * (docs/plan.md F9).
 */
export function useEconomy(): { config: EconomyConfig | null; error: string | null; reload: () => void } {
  const [config, setConfig] = useState<EconomyConfig | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);

    load()
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((err) => {
        if (active) setError(err?.message || "Couldn't load the case settings.");
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  return { config, error, reload: () => setAttempt((n) => n + 1) };
}
