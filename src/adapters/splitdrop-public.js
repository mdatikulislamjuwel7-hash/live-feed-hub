import crypto from "crypto";
import * as cheerio from "cheerio";

function hashId(sourceId, parts) {
  return crypto
    .createHash("sha256")
    .update([sourceId, ...parts].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function asNumber(value) {
  const num = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function truncate(text, max = 120) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function hiddenValue($, card, id) {
  return card.find(`input#${id}`).attr("value") || "";
}

/**
 * Splitdrop's public guest pages do not expose the private/recent earner feed,
 * but the offers page renders public featured offers server-side.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchSplitdropPublic(source) {
  const url = String(source.url || "https://splitdrop.com/offers.html");
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      Referer: "https://splitdrop.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  const $ = cheerio.load(await res.text());
  const at = new Date().toISOString();

  return $(".offer-categories-item")
    .toArray()
    .map((el) => {
      const card = $(el);
      const offerName = hiddenValue($, card, "name") || card.find("h4,h5,.text-white").first().text() || "Featured offer";
      const network = hiddenValue($, card, "network_") || "Featured";
      const payout = asNumber(hiddenValue($, card, "payoutUSD_") || hiddenValue($, card, "currency_award"));
      const id = hashId(String(source.id), [network, offerName, payout]);

      return {
        id: `${source.id}-${id}`,
        source: String(source.id),
        sourceName: String(source.name),
        user: "Splitdrop public",
        offer: truncate(`${network} -> ${offerName}`),
        offerwall: network,
        offerName: truncate(offerName),
        country: null,
        isPrivate: false,
        amount: payout,
        unit: "usd",
        rawAmount: payout > 0 ? `$${payout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00",
        at,
      };
    })
    .filter((event) => event.offerName && event.amount > 0)
    .slice(0, Number(source.limit) || 30);
}
