import crypto from "crypto";
import * as cheerio from "cheerio";

function amountFrom(text) {
  const n = Number(String(text || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Public homepage ticker cards (Rubcashly-style completed offers).
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchTickerCardsHtml(source) {
  const res = await fetch(String(source.url || "https://rubcashly.com/"), {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });
  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  const root = String(source.tickerSelector || "#ticker-completed");
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];
  const seen = new Set();
  const isWithdraw = root.includes("withdraw");

  $(`${root} .ticker-card`).each((_, card) => {
    const el = $(card);
    const user = el.find("p.font-medium").first().text().trim();
    const row = el.find(".flex.w-full.items-center.gap-2").first();
    const offerwall = row.find("span.text-xs").first().text().trim() || "Offer";
    const amountText =
      row.find("span.flex span").last().text().trim() ||
      row.find("span").last().text().trim();
    if (!user) return;

    const amount = amountFrom(amountText);
    const offerName = isWithdraw ? `${offerwall} withdrawal` : "Completed offer";
    const key = `${user}|${offerwall}|${amountText}|${isWithdraw ? "w" : "o"}`;
    if (seen.has(key)) return;
    seen.add(key);

    const id = crypto.createHash("sha256").update(`${source.id}|${key}`).digest("hex").slice(0, 24);
    events.push({
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user,
      offer: `${offerwall} → ${offerName}`,
      offerwall,
      offerName,
      country: null,
      isPrivate: false,
      amount,
      unit: "coins",
      rawAmount: amountText ? `${amountText} coins` : `${amount} coins`,
      at: new Date().toISOString(),
    });
  });

  if (!events.length) throw new Error(`${source.name}: no ticker cards found`);
  return events.slice(0, Number(source.limit) || 40);
}
