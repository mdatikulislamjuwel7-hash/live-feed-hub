import crypto from "crypto";
import * as cheerio from "cheerio";

function amountFrom(text) {
  const n = Number(String(text || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Public homepage activity cards. This uses only visible, no-login content.
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchCashlyearnPublic(source) {
  const res = await fetch(String(source.url || "https://cashlyearn.com/"), {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });
  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];

  $("img[alt]").each((_, img) => {
    const title = String($(img).attr("alt") || "").trim();
    if (!title || title === "CashlyEarn") return;

    const card = $(img).closest(".glass-neon");
    const status = card.find("span").first().text().trim() || "Earn";
    const detail = card.find("p").first().text().trim() || "Public activity";
    const rewardText = card.find("div.text-neon-green").last().text().trim();
    if (!rewardText) return;

    const id = crypto
      .createHash("sha256")
      .update(`${source.id}|${title}|${detail}|${rewardText}`)
      .digest("hex")
      .slice(0, 24);

    events.push({
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user: "public",
      offer: `${status} -> ${title}`,
      offerwall: status,
      offerName: title,
      country: null,
      isPrivate: false,
      amount: amountFrom(rewardText),
      unit: rewardText.startsWith("$") ? "USD" : "reward",
      rawAmount: rewardText,
      at: new Date().toISOString(),
    });
  });

  return events.slice(0, Number(source.limit) || 8);
}
