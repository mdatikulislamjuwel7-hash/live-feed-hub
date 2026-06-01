import crypto from "crypto";
import * as cheerio from "cheerio";

function clean(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function pickTooltipValue(html, label) {
  const $ = cheerio.load(String(html));
  let value = "";
  $("p").each((_, el) => {
    const text = clean($(el).text());
    const prefix = `${label}:`;
    if (!value && text.toLowerCase().startsWith(prefix.toLowerCase())) {
      value = clean(text.slice(prefix.length));
    }
  });
  return value;
}

function toNumber(value) {
  const num = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchZxearnHtml(source) {
  const res = await fetch(String(source.url || "https://zxearn.com"), {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 30000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];

  $(".user-List-CSM[data-feed-type='offer']").each((_, el) => {
    const item = $(el);
    const tooltip = item.attr("data-bs-original-title") || "";
    const user = clean(item.find(".l_p_ti").first().text()) || "anonymous";
    const offerwall =
      pickTooltipValue(tooltip, "Name") ||
      clean(item.find(".l_p_ti_1").first().text()) ||
      "Offer";
    const offerName = pickTooltipValue(tooltip, "Offername") || "Offer";
    const amountText =
      pickTooltipValue(tooltip, "Amount") || clean(item.find(".pd_amm").first().text());
    const amount = toNumber(amountText);
    const rawId = item.attr("data-id") || item.attr("data-user-id") || "";
    const id = crypto
      .createHash("sha256")
      .update(`${source.id}|${rawId}|${user}|${offerwall}|${offerName}|${amount}`)
      .digest("hex")
      .slice(0, 24);

    events.push({
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user,
      offer: `${offerwall} -> ${offerName}`.slice(0, 120),
      offerwall,
      offerName: offerName.slice(0, 120),
      country: null,
      isPrivate: false,
      amount,
      unit: "coins",
      rawAmount: amountText || `${amount} coins`,
      at: new Date().toISOString(),
    });
  });

  return events.slice(0, Number(source.limit) || 30);
}
