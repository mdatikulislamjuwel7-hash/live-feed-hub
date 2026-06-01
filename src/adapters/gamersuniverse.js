import * as cheerio from "cheerio";
import crypto from "crypto";
import { getBrowser } from "./apucash-browser.js";
import { withBrowserLock } from "../browser-lock.js";
import {
  loadGamersuniverseCookie,
  parseCookieHeader,
} from "./gamersuniverse-cookie.js";

const FLAG_TO_COUNTRY = {
  us: "United States",
  de: "Germany",
  gb: "United Kingdom",
  fr: "France",
  br: "Brazil",
  ca: "Canada",
  au: "Australia",
  in: "India",
  bd: "Bangladesh",
  ph: "Philippines",
  ng: "Nigeria",
  pk: "Pakistan",
};

const LIVE_FEED_LIMIT = 50;

/**
 * @param {Record<string, unknown>} source
 */
function shouldIncludePayouts(source) {
  return source.includePayouts !== false;
}

/**
 * @param {ReturnType<typeof parseCompletionBlock>[]} rows
 * @param {Record<string, unknown>} source
 */
function filterPayoutRows(rows, source) {
  if (shouldIncludePayouts(source)) return rows;
  return rows.filter(
    (row) =>
      row &&
      row.offerwall !== "Payout" &&
      row.offerwall !== "Cash Out" &&
      row.offerName !== "Withdrawal"
  );
}

/**
 * @param {string} flagSrc
 * @param {string} flagAlt
 */
function countryFromFlag(flagSrc, flagAlt) {
  const codeMatch =
    flagSrc.match(/\/w40\/([a-z]{2})\./i) ||
    flagAlt.match(/^([A-Za-z]{2})\s+flag/i);
  if (!codeMatch) return null;
  const code = codeMatch[1].toLowerCase();
  return FLAG_TO_COUNTRY[code] || code.toUpperCase();
}

/**
 * @param {string} block
 */
function parseCompletionBlock(block) {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const user = block.match(/\bU\d{4,}\b/i)?.[0] || "";
  const wallLine = lines.find((l) => /^(Offery|Payout)$/i.test(l));
  const offerwall = wallLine || (block.includes("Payout") ? "Payout" : "Offery");

  let offerName = "";
  const completed = lines.find((l) => /^Completed\b/i.test(l));
  const withdrew = lines.find((l) => /^Withdrew\b/i.test(l));
  if (completed) {
    offerName = completed
      .replace(/^Completed\s+/i, "")
      .replace(/^["']|["']$/g, "")
      .trim();
  } else if (withdrew) {
    offerName = withdrew
      .replace(/^Withdrew\s+/i, "")
      .replace(/\s+via\s+.+$/i, "")
      .trim();
  }

  const coinMatch = block.match(/([\d,]+)\s*Coins?\s*•\s*\$?([\d.]+)/i);
  const amount = coinMatch
    ? parseFloat(coinMatch[2].replace(/,/g, ""))
    : parseFloat((block.match(/\$([\d.]+)/) || [])[1] || "0");
  const coins = coinMatch
    ? parseInt(coinMatch[1].replace(/,/g, ""), 10)
    : amount;

  const countryLine = lines.find((l) => /^(US|DE|GB|FR|BR|CA)$/i.test(l));
  let country = countryLine
    ? FLAG_TO_COUNTRY[countryLine.toLowerCase()] || countryLine
    : null;

  if (!user) return null;

  return {
    user,
    offerwall,
    offerName: offerName || (offerwall === "Payout" ? "Withdrawal" : "Offer"),
    amount: offerwall === "Payout" ? amount : coins,
    unit: offerwall === "Payout" ? "USD" : "coins",
    rawAmount:
      offerwall === "Payout"
        ? `$${amount.toFixed(2)}`
        : `${coins} coins ($${amount.toFixed(2)})`,
    country,
  };
}

/**
 * @param {string} html
 */
function parseLiveCompletionsHtml(html) {
  const $ = cheerio.load(html);
  if (!$.root().text().includes("Live Completions")) return [];

  /** @type {ReturnType<typeof parseCompletionBlock>[]} */
  const rows = [];

  $("[class*='completion'], [class*='live-comp'], .card").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!/\bU\d{4,}\b/.test(text)) return;
    if (!/Completed|Withdrew/i.test(text)) return;
    const row = parseCompletionBlock($(el).text());
    if (row) rows.push(row);
  });

  if (rows.length) return rows;

  const body = $.root().text();
  const chunks = body.split(/(?=Offery|Payout)/i).slice(1);
  for (const chunk of chunks.slice(0, 50)) {
    const row = parseCompletionBlock(chunk.slice(0, 500));
    if (row && /\bU\d{4,}\b/.test(chunk)) rows.push(row);
  }

  return rows;
}

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {import('cheerio').Cheerio<import('cheerio').Element>} $item
 */
function parsePayoutItem($, $item) {
  const spans = $item.find("span");
  if (spans.length < 3) return null;

  const userBlock = $(spans.get(0));
  const userText = userBlock.text().replace(/\s+/g, " ").trim();
  const user = userText.match(/U\d+/i)?.[0] || userText;
  const amountText = $(spans.get(1)).text().trim();
  const method = $(spans.get(2)).text().trim();
  const amount = parseFloat(amountText.replace(/[$,]/g, "")) || 0;
  const country = countryFromFlag(
    userBlock.find("img.flag").attr("src") || "",
    userBlock.find("img.flag").attr("alt") || ""
  );

  if (!user || !method) return null;
  return { user, amount, method, country };
}

/**
 * @param {ReturnType<typeof parseCompletionBlock>[]} rows
 * @param {Record<string, unknown>} source
 */
function buildCompletionEvents(rows, source) {
  const now = new Date().toISOString();
  return filterPayoutRows(rows, source).slice(0, 40).map((row) => {
    const offer = `${row.offerwall} → ${row.offerName}`;
    const id = crypto
      .createHash("sha256")
      .update(`${source.id}|${row.user}|${row.offerwall}|${row.offerName}|${row.amount}`)
      .digest("hex")
      .slice(0, 24);
    return {
      id: `${source.id}-${id}`,
      source: /** @type {string} */ (source.id),
      sourceName: /** @type {string} */ (source.name),
      user: row.user,
      offer,
      offerwall: row.offerwall,
      offerName: row.offerName,
      country: row.country,
      isPrivate: false,
      amount: row.amount,
      unit: row.unit,
      rawAmount: row.rawAmount,
      at: now,
    };
  });
}

/**
 * @param {Record<string, unknown>} item
 */
function parseLiveFeedItem(item) {
  const user = String(item.user || "");
  if (!user) return null;

  const type = String(item.type || "");
  const badge = String(item.badge || "");
  const isPayout = type === "payout" || badge === "Payout";
  const offerwall = isPayout ? "Payout" : badge || "Offery";

  const flag = String(item.flag || item.avatar || "").toLowerCase();
  const country = FLAG_TO_COUNTRY[flag] || null;

  if (isPayout) {
    const method = String(item.method || "Withdrawal");
    const amountText = String(item.amount || "$0");
    const amount = parseFloat(amountText.replace(/[$,]/g, "")) || 0;
    return {
      user,
      offerwall,
      offerName: method,
      amount,
      unit: "USD",
      rawAmount: amountText.startsWith("$") ? amountText : `$${amount.toFixed(2)}`,
      country,
    };
  }

  const offerName = String(item.offer || "Offer");
  const coins = parseInt(String(item.coins || "0").replace(/,/g, ""), 10) || 0;
  const dollars = coins / 10000;
  return {
    user,
    offerwall,
    offerName,
    amount: coins,
    unit: "coins",
    rawAmount: `${coins.toLocaleString()} coins ($${dollars.toFixed(2)})`,
    country,
  };
}

/**
 * @param {string} cookie
 * @param {string} url
 */
async function fetchLiveViaLiveFeed(cookie, url) {
  const apiUrl = new URL("https://gamersunivers.com/system/ajax.php");
  apiUrl.searchParams.set("a", "liveFeed");
  apiUrl.searchParams.set("limit", String(LIVE_FEED_LIMIT));

  const res = await fetch(apiUrl, {
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: url,
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) throw new Error(`liveFeed HTTP ${res.status}`);
  const text = await res.text();
  if (!text?.trim()) throw new Error("liveFeed empty");

  /** @type {unknown} */
  const data = JSON.parse(text);
  if (!Array.isArray(data) || !data.length) throw new Error("liveFeed not array");

  return data.map(parseLiveFeedItem).filter(Boolean);
}

/**
 * @param {string} cookie
 * @param {string} url
 */
async function fetchLiveViaHttp(cookie, url) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseLiveCompletionsHtml(await res.text());
}

/**
 * @param {string} cookie
 * @param {string} url
 */
async function fetchLiveViaBrowser(cookie, url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    const cookies = parseCookieHeader(cookie);
    if (cookies.length) await page.setCookie(...cookies);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 6000));

    const rows = await page.evaluate(() => {
      /** @type {Array<Record<string, string|null>>} */
      const out = [];
      const seen = new Set();

      for (const el of document.querySelectorAll("div")) {
        const text = (el.innerText || "").trim();
        if (text.length < 35 || text.length > 500) continue;
        if (!/\bU\d{4,}\b/.test(text)) continue;
        if (!/\b(Offery|Payout)\b/i.test(text) && !/Completed|Withdrew/i.test(text))
          continue;
        if (seen.has(text)) continue;
        const childCount = [...el.querySelectorAll("div")].filter(
          (c) => (c.innerText || "").trim().length > 20
        ).length;
        if (childCount > 2) continue;
        seen.add(text);

        const flag = el.querySelector("img[src*='flagcdn'], img[alt*='flag']");
        const flagSrc = flag?.getAttribute("src") || "";
        const flagAlt = flag?.getAttribute("alt") || "";
        out.push({ text, flagSrc, flagAlt });
      }
      return out;
    });

    return rows
      .map(({ text, flagSrc, flagAlt }) => {
        const parsed = parseCompletionBlock(text);
        if (!parsed) return null;
        if (!parsed.country) {
          parsed.country = countryFromFlag(flagSrc, flagAlt);
        }
        return parsed;
      })
      .filter(Boolean);
  } finally {
    await page.close();
  }
}

/**
 * @param {Record<string, unknown>} source
 */
async function fetchPublicPayouts(source) {
  if (!shouldIncludePayouts(source)) return [];

  const url = String(source.url || "https://gamersunivers.com/page/live.html");
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  const events = [];
  const now = new Date().toISOString();
  const offerwall = "Cash Out";

  $(".payout-item").each((_, el) => {
    const row = parsePayoutItem($, $(el));
    if (!row) return;

    const offerName = row.method;
    const id = crypto
      .createHash("sha256")
      .update(`${source.id}|${row.user}|${row.method}|${row.amount}`)
      .digest("hex")
      .slice(0, 24);

    events.push({
      id: `${source.id}-${id}`,
      source: /** @type {string} */ (source.id),
      sourceName: /** @type {string} */ (source.name),
      user: row.user,
      offer: `${offerwall} → ${offerName}`,
      offerwall,
      offerName,
      country: row.country,
      isPrivate: false,
      amount: row.amount,
      unit: "USD",
      rawAmount: `$${row.amount.toFixed(2)}`,
      at: now,
    });
  });

  if (!events.length) throw new Error(`${source.name}: no payout items in HTML`);
  return events;
}

/**
 * @param {Record<string, unknown>} source
 */
async function fetchWithCookie(source, cookie) {
  const url = String(source.url || "https://gamersunivers.com/page/live.html");

  /** @type {ReturnType<typeof parseCompletionBlock>[]} */
  let rows = [];

  try {
    rows = await fetchLiveViaLiveFeed(cookie, url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[gamersuniverse] liveFeed API: ${msg}`);
  }

  if (rows.length < 5) {
    const htmlRows = await fetchLiveViaHttp(cookie, url).catch(() => []);
    if (htmlRows.length > rows.length) rows = htmlRows;
  }
  if (rows.length < 5) {
    const browserRows = await withBrowserLock(() =>
      fetchLiveViaBrowser(cookie, url)
    );
    if (browserRows.length > rows.length) rows = browserRows;
  }

  if (!rows?.length) {
    throw new Error("no Live Completions (check cookie / login)");
  }

  const events = buildCompletionEvents(rows, source);
  console.log(`[gamersuniverse] ${events.length} live completions (logged in)`);
  return events;
}

/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchGamersuniverse(source) {
  const cookie = loadGamersuniverseCookie();

  if (cookie) {
    try {
      return await fetchWithCookie(source, cookie);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[gamersuniverse] session feed failed (${msg}), public payouts`);
    }
  } else {
    console.warn(
      "[gamersuniverse] config/gamersuniverse.cookie missing — only public payouts (no Offery/completions)"
    );
  }

  const events = await fetchPublicPayouts(source);
  console.log(`[gamersuniverse] ${events.length} public payouts only`);
  return events;
}
