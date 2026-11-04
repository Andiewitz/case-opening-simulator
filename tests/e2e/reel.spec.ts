import { expect, test } from "@playwright/test";

/**
 * The reel is the one piece of logic that can break silently: the server picks
 * the item, the client maps it to reel index 45 and slides the strip so that
 * tile sits under the centre tick. If that mapping or the offset maths drifts,
 * the animation still looks fine but lands on the wrong card.
 *
 * These tests assert the mapping and the offset, never the audio or the exact
 * millisecond timings (those are tuned by ear and documented in CaseOpener.tsx).
 */

function base64url(value: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const ACCESS_TOKEN = [
  base64url({ alg: "none" }),
  base64url({ sub: "e2e-user", exp: Math.floor(Date.now() / 1000) + 3600 }),
  "signature",
].join(".");

const PROFILE = { sub: "e2e-user", userId: "e2e-user", email: "e2e@example.com" };

test.beforeEach(async ({ page }) => {
  // Signed-in state without touching Cognito: the app trusts the cached
  // profile and refreshes it through the stub API.
  await page.addInitScript(
    ({ token, profile }) => {
      localStorage.setItem("cs2_unboxed_access_token", token);
      localStorage.setItem("cs2_unboxed_profile", JSON.stringify(profile));
    },
    { token: ACCESS_TOKEN, profile: PROFILE }
  );
});

test("the reel stops on the item the API returned", async ({ page }) => {
  await page.goto("/case/e2e-crate");

  const unlock = page.getByRole("button", { name: "Unlock Container" });
  await expect(unlock).toBeEnabled({ timeout: 20_000 });
  await unlock.click();

  const tiles = page.locator(".uo-rtile");
  await expect(tiles).toHaveCount(60, { timeout: 20_000 });

  // The winner is pinned to index 45 (0-based) by CaseOpener.
  await expect(tiles.nth(45)).toContainText("AK-47");
  await expect(tiles.nth(45)).toContainText("Redline");

  // And the strip is moved to that index: 45 * 160px pitch + half a tile,
  // plus the deliberate ±40px jitter.
  await page.waitForFunction(
    () => {
      const reel = document.querySelector(".uo-reel-mask > div") as HTMLElement | null;
      return !!reel && /translateX\(-\d/.test(reel.style.transform);
    },
    undefined,
    { timeout: 20_000 }
  );

  const offset = await page.evaluate(() => {
    const reel = document.querySelector(".uo-reel-mask > div") as HTMLElement;
    const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(reel.style.transform);
    return match ? Number(match[1]) : 0;
  });

  expect(offset).toBeGreaterThan(-7320);
  expect(offset).toBeLessThan(-7230);

  // The reveal is announced for screen readers with the same item.
  await expect(page.locator('[aria-live="assertive"]')).toContainText("AK-47 | Redline", {
    timeout: 25_000,
  });
});

test("deep links render client-side routes", async ({ page }) => {
  await page.goto("/inventory");

  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await expect(page.getByText("Your inventory is empty")).toBeVisible({ timeout: 20_000 });
});
