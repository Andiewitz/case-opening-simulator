import { getBakedGzip, staleCrates } from "../shared/crates";
import { corsHeaders, json } from "../shared/utils";

/**
 * GET /crates — the crates feed for the storefront.
 *
 * The upstream feed is ~5 MB of JSON, so this endpoint:
 *   - caches the parsed + projected dataset in Lambda memory (10 min TTL),
 *   - serves a pre-baked gzip (base64) body so repeat requests skip the
 *     stringify + gzip work,
 *   - sets long Cache-Control so browsers keep the feed for an hour and
 *     revalidate in the background after that — cached visits cost nothing
 *     (no Lambda invocation, no API Gateway request, no transfer).
 */
const BROWSER_CACHE = "public, max-age=3600, stale-while-revalidate=86400";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  const responseHeaders = {
    ...corsHeaders,
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
  } catch (e) {
    // Serve stale cache rather than failing hard if GitHub hiccups
    // (uncompressed in this degraded path).
    const stale = staleCrates();
    if (stale) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, "Cache-Control": BROWSER_CACHE },
        body: JSON.stringify(stale),
      };
    }
    return json(502, { error: "Failed to fetch crates" });
  }
};
