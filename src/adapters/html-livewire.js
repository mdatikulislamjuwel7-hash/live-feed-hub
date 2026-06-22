import { fetchApucashRenderedHtml } from "./apucash-browser.js";
import { parseApucashHtml } from "./parse-apucash-html.js";
import {
  loadApucashCookie,
  fetchApucashViaLivewire,
  fetchApucashProfilesViaLivewire,
} from "./apucash-livewire.js";

function extractUserIds(html) {
  return [...String(html || "").matchAll(/userId':\s*'(\d+)'/g)].map((match) => match[1]);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtmlWithRetry(source, url) {
  const retries = Math.max(0, Number(source.fetchRetries) || 0);
  const timeoutMs = Number(source.timeoutMs) || 30000;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(url, {
        headers: {
          Accept: "text/html",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = err;
      if (attempt < retries) await wait(750 * (attempt + 1));
    }
  }

  throw lastError;
}

/**
 * ApuCash: cookie Livewire → headless browser → fast HTML.
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchHtmlLivewire(source) {
  const url = String(source.url || "https://apucash.com");
  const useBrowser = source.useBrowser !== false;

  const cookie = loadApucashCookie();
  if (cookie) {
    try {
      const lwHtml = await fetchApucashViaLivewire(cookie);
      if (lwHtml) {
        const profiles = await fetchApucashProfilesViaLivewire(
          cookie,
          extractUserIds(lwHtml),
          Number(source.profileLimit) || 12
        );
        const events = await parseApucashHtml(lwHtml, source, profiles);
        const named = events.filter(
          (e) => e.offerName && !String(e.offerName).includes("coin reward")
        );
        console.log(
          `[apucash] livewire session: ${events.length} items, ${named.length} named`
        );
        return events;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[apucash] livewire: ${msg}`);
    }
  }

  if (useBrowser) {
    try {
      const { html, profiles } = await fetchApucashRenderedHtml(url);
      const events = await parseApucashHtml(html, source, profiles);
      const withRealName = events.filter(
        (e) =>
          e.offerName &&
          !e.offerName.includes("coin reward") &&
          !e.offerName.includes("Pending")
      );
      if (withRealName.length > 0) {
        console.log(`[apucash] browser: ${withRealName.length} with offer names`);
      }
      return events;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[apucash] browser fallback: ${msg}`);
    }
  }

  const res = await fetchHtmlWithRetry(source, url);

  if (!res.ok) {
    throw new Error(`${source.name}: HTTP ${res.status}`);
  }

  return parseApucashHtml(await res.text(), source);
}
