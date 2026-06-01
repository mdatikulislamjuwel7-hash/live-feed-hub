import * as cheerio from "cheerio";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = join(__dirname, "..", "..", "config", "apucash.cookie");

/** @returns {string|undefined} */
export function loadApucashCookie() {
  if (process.env.APUCASH_COOKIE?.trim()) {
    return process.env.APUCASH_COOKIE.trim();
  }
  if (existsSync(COOKIE_FILE)) {
    return readFileSync(COOKIE_FILE, "utf8").trim();
  }
  return undefined;
}

/**
 * @param {string} cookieHeader
 * @returns {Promise<string|null>}
 */
export async function fetchApucashViaLivewire(cookieHeader) {
  const home = await fetch("https://apucash.com/", {
    headers: {
      Accept: "text/html",
      Cookie: cookieHeader,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!home.ok) return null;

  const setCookie = home.headers.getSetCookie?.() || [];
  const merged = new Map();
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) merged.set(k, v.join("="));
  }
  for (const c of setCookie) {
    const [pair] = c.split(";");
    const [k, ...v] = pair.split("=");
    if (k) merged.set(k.trim(), v.join("="));
  }
  const cookie = [...merged.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const html = await home.text();
  const $ = cheerio.load(html);
  const snapRaw = $("#last_offers [wire\\:snapshot]").first().attr("wire:snapshot");
  if (!snapRaw) return null;

  const snapshot = snapRaw.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const metaCsrf = $('meta[name="csrf-token"]').attr("content");
  const xsrf = merged.get("XSRF-TOKEN");
  const token = metaCsrf || (xsrf ? decodeURIComponent(xsrf) : "");

  const res = await fetch("https://apucash.com/livewire/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-TOKEN": token,
      "X-XSRF-TOKEN": xsrf ? decodeURIComponent(xsrf) : token,
      "X-Livewire": "",
      Cookie: cookie,
      Referer: "https://apucash.com/",
      Origin: "https://apucash.com",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      _token: token,
      components: [{ snapshot, updates: {}, calls: [] }],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) return null;

  const json = await res.json();
  return json?.components?.[0]?.effects?.html || null;
}
