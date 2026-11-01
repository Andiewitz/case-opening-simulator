// Steam's economy image CDN base. The crates feed stores the compact
// image hash (without this prefix) to keep the payload small; every
// rendered <img> goes through steamImg() to rebuild the full URL.
const STEAM_IMG_CDN = "https://community.akamai.steamstatic.com/economy/image/";

export function steamImg(src?: string | null): string | undefined {
  if (!src) return undefined;
  if (/^https?:\/\//.test(src)) return src;
  return STEAM_IMG_CDN + src;
}
