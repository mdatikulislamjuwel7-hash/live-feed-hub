import crypto from "crypto";
import * as cheerio from "cheerio";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function amountFrom(text) {
  const n = Number(String(text || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hashId(sourceId, parts) {
  return crypto
    .createHash("sha256")
    .update([sourceId, ...parts].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function shouldBlock(text, source) {
  const patterns = Array.isArray(source.blockOfferPatterns)
    ? source.blockOfferPatterns.map((p) => String(p).toLowerCase())
    : [];
  const value = String(text || "").toLowerCase();
  return patterns.some((pattern) => value.includes(pattern));
}

function parseOfferText(text) {
  const cleaned = cleanText(text)
    .replace(/\(TXID:[^)]+\)/gi, "")
    .replace(/\s+IP\s*:\s*.+$/i, "")
    .trim();

  const offerName =
    cleaned.match(/offer\s*name\s*:\s*(.+?)(?:\s*\.\s*IP:|$)/i)?.[1]?.trim() ||
    cleaned.match(/Offername:\s*(.+?)(?:\s*\.\s*IP:|$)/i)?.[1]?.trim() ||
    "";
  const wall =
    cleaned.match(/^([^:]+):/)?.[1]?.trim() ||
    cleaned.match(/^(.+?)\s+offerwall/i)?.[1]?.trim() ||
    "";

  if (/^withdraw/i.test(cleaned)) {
    return { offerwall: "Cashout", offerName: "Withdrawal" };
  }
  if (/^signup[_\s-]*bonus/i.test(cleaned)) {
    return { offerwall: "Signup Bonus", offerName: "Signup Bonus" };
  }
  if (offerName) {
    return { offerwall: wall || "Offer", offerName: offerName.replace(/\s*\.+$/, "").trim() };
  }
  if (wall) {
    return { offerwall: wall, offerName: cleaned.slice(wall.length + 1).trim() || `${wall} live offer` };
  }
  return { offerwall: cleaned || "Offer", offerName: cleaned || "Live offer" };
}

function makeEvent(source, row) {
  const amount = amountFrom(row.amountText);
  const rawAmount = row.amountText || `${amount} coins`;
  const at = new Date().toISOString();
  const id = hashId(String(source.id), [
    row.user,
    row.offerwall,
    row.offerName,
    rawAmount,
  ]);

  return {
    id: `${source.id}-${id}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: row.user,
    offer: `${row.offerwall} → ${row.offerName}`,
    offerwall: row.offerwall,
    offerName: row.offerName,
    country: null,
    isPrivate: false,
    amount,
    unit: String(source.unit || "coins"),
    rawAmount,
    at,
  };
}

function parseLiveItems($, source) {
  return $(".live-container .live-item, .live-item")
    .toArray()
    .map((el) => {
      const item = $(el);
      const offerwall = cleanText(item.find(".live-network").first().text()) || "Offer";
      const user = cleanText(item.find(".live-user").first().text()) || "anonymous";
      const amountText = cleanText(item.find(".live-coins").first().text());
      const offerName = `${offerwall} live offer`;
      return { user, offerwall, offerName, amountText };
    })
    .filter((row) => row.user && row.amountText && !shouldBlock(`${row.offerwall} ${row.offerName}`, source));
}

function parseMistCoins($, source) {
  const rows = [];
  const seen = new Set();
  $("[wire\\:snapshot] .flex.items-center.gap-2.px-2").each((_, el) => {
    const text = cleanText($(el).text());
    const match = text.match(/^(.+?)\s+(\+?-?\$?[\d,.]+)\s+(.+?)\s*•?$/);
    if (!match) return;
    const [, user, amountText, offerwallRaw] = match;
    const offerwall = cleanText(offerwallRaw);
    const key = `${user}|${amountText}|${offerwall}`;
    if (seen.has(key) || shouldBlock(key, source)) return;
    seen.add(key);
    rows.push({
      user: cleanText(user),
      offerwall,
      offerName: offerwall.toLowerCase() === "cashout" ? "Withdrawal" : `${offerwall} live offer`,
      amountText,
    });
  });
  return rows;
}

function parseZombieSwiper($, source) {
  return $(".swiper-slide .box")
    .toArray()
    .map((el) => {
      const box = $(el);
      const spans = box.find(".text span").toArray().map((span) => cleanText($(span).text()));
      const desc = spans[0] || "";
      const user = spans[1] || "anonymous";
      const amountText = cleanText(box.find(".number span").first().text());
      const parsed = parseOfferText(desc);
      return { user, amountText, ...parsed, desc };
    })
    .filter((row) => row.user && row.amountText && !shouldBlock(row.desc || row.offerName, source));
}

/**
 * Generic public homepage live feed parser for simple public tickers.
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchPublicLiveFeed(source) {
  const res = await fetch(String(source.url), {
    headers: {
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });
  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  const mode = String(source.publicFeedMode || "");
  const rows =
    mode === "mistcoins"
      ? parseMistCoins($, source)
      : mode === "zombie-swiper"
        ? parseZombieSwiper($, source)
        : parseLiveItems($, source);

  const events = [];
  const seen = new Set();
  for (const row of rows) {
    const event = makeEvent(source, row);
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    events.push(event);
  }

  if (!events.length) throw new Error(`${source.name}: no public live feed rows`);
  return events.slice(0, Number(source.limit) || 40);
}
