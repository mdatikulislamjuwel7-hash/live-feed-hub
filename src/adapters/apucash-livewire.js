import * as cheerio from "cheerio";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { parseProfileModalText } from "./apucash-profiles.js";

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

function decodeAttr(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'");
}

/**
 * @param {string} cookieHeader
 */
async function fetchApucashHome(cookieHeader) {
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
  const xsrf = merged.get("XSRF-TOKEN");
  const token = $('meta[name="csrf-token"]').attr("content") || (xsrf ? decodeURIComponent(xsrf) : "");

  return { html, $, cookie, xsrf, token };
}

/**
 * @param {string} cookieHeader
 * @returns {Promise<string|null>}
 */
export async function fetchApucashViaLivewire(cookieHeader) {
  const home = await fetchApucashHome(cookieHeader);
  if (!home) return null;
  const { $, cookie, xsrf, token } = home;
  const snapRaw = $("#last_offers [wire\\:snapshot]").first().attr("wire:snapshot");
  if (!snapRaw) return null;

  const snapshot = decodeAttr(snapRaw);

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

/**
 * Fetch ApuCash profile modal data through Livewire and parse recent activity.
 * @param {string} cookieHeader
 * @param {string[]} userIds
 * @param {number} [limit]
 * @returns {Promise<Map<string, import('./apucash-profile-types.js').UserProfile>>}
 */
export async function fetchApucashProfilesViaLivewire(cookieHeader, userIds, limit = 10) {
  const out = new Map();
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, limit);
  if (!ids.length) return out;

  const home = await fetchApucashHome(cookieHeader);
  if (!home) return out;
  const { $, cookie, xsrf, token } = home;
  const snapRaw = $("[wire\\:snapshot]")
    .toArray()
    .map((el) => $(el).attr("wire:snapshot") || "")
    .find((snapshot) => decodeAttr(snapshot).includes("frontend.profile.profile-modal"));
  if (!snapRaw) return out;

  let snapshot = decodeAttr(snapRaw);
  for (const userId of ids) {
    try {
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
          components: [
            {
              snapshot,
              updates: {},
              calls: [
                {
                  path: "",
                  method: "__dispatch",
                  params: ["openProfileModal", { userId }],
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      snapshot = json?.components?.[0]?.snapshot || snapshot;
      const html = json?.components?.[0]?.effects?.html || "";
      const text = cheerio.load(html)("body").text().trim();
      const partial = parseProfileModalText(text);
      if (!partial.username && !partial.activities?.length && !partial.isPrivate) continue;
      out.set(userId, {
        userId,
        username: partial.username || "",
        country: partial.country || "",
        isPrivate: !!partial.isPrivate,
        activities: partial.activities || [],
      });
    } catch {
      /* skip this profile */
    }
  }
  return out;
}
