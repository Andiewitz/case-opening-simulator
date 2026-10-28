import { CSGO_API_BASE } from "../config";
import { corsHeaders, json } from "../shared/utils";

export const handler = async (event: any): Promise<any> => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  try {
    const res = await fetch(`${CSGO_API_BASE}/crates.json`);
    const data = await res.json();
    const crates = data.filter(
      (c: any) =>
        (c.type === "Case" || c.type === "Sticker Capsule" || c.type === "Autograph Capsule") &&
        c.contains &&
        c.contains.length > 0
    );
    return json(200, crates);
  } catch (e) {
    return json(502, { error: "Failed to fetch crates" });
  }
};
