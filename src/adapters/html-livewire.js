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

  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`${source.name}: HTTP ${res.status}`);
  }

  return parseApucashHtml(await res.text(), source);
}
