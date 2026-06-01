import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = join(__dirname, "..", "..", "config", "gamersuniverse.cookie");

/** @returns {string|undefined} */
export function loadGamersuniverseCookie() {
  if (process.env.GAMERSUNIVERSE_COOKIE?.trim()) {
    return process.env.GAMERSUNIVERSE_COOKIE.trim();
  }
  if (existsSync(COOKIE_FILE)) {
    return readFileSync(COOKIE_FILE, "utf8").trim();
  }
  return undefined;
}

/**
 * @param {string} cookieHeader
 * @returns {import('puppeteer').Protocol.Network.CookieParam[]}
 */
export function parseCookieHeader(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq < 0) return null;
      return {
        name: part.slice(0, eq).trim(),
        value: part.slice(eq + 1).trim(),
        domain: "gamersunivers.com",
        path: "/",
      };
    })
    .filter(Boolean);
}
