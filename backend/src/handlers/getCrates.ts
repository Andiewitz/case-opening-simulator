import { getBakedGzip, staleCrates } from "../shared/crates";
import { corsHeaders, json, preflight, logEvent, logFailure } from "../shared/utils";

/**
 * GET /crates — the crates feed for the storefront.
 *
 * The upstream feed is ~5 MB of JSON, so this endpoint:
 *   - caches the parsed + projected dataset in Lambda memory,
 *   - serves a pre-baked gzip (base64) body so repeat requests skip the
 *     stringify + gzip work,
 *   - sets long Cache-Control so browsers keep the feed for an hour and
 *     revalidate in the background after that — cached visits cost nothing
 *     (no Lambda invocation, no API Gateway request, no transfer).
 */
const BROWSER_CACHE = "public, max-age=3600, stale-while-revalidate=86400";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") return preflight(event);

  const responseHeaders = {
    ...corsHeaders(event),
    "Content-Encoding": "gzip",
    "Cache-Control": BROWSER_CACHE,
  };

  try {
    return {
      statusCode: 200,
      headers: responseHeaders,
      isBase64Encoded: true,
      body: await getBakedGzip(),
    };
  } catch (error: any) {
    // Serve stale cache rather than failing hard if the snapshot is missing
    // (uncompressed in this degraded path).
    logFailure(event, "get_crates_degraded", error);
    const stale = staleCrates();
    if (stale) {
      logEvent("warn", "get_crates_stale", event, { crates: stale.length });
      return {
        statusCode: 200,
        headers: { ...corsHeaders(event), "Cache-Control": BROWSER_CACHE },
        body: JSON.stringify(stale),
      };
    }
    return json(event, 502, { error: "Failed to fetch crates" });
  }
};
