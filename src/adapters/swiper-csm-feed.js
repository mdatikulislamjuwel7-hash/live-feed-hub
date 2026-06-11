import crypto from "crypto";
import * as cheerio from "cheerio";

function decodeAttr(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'");
}

function amountFrom(text) {
  const n = Number(String(text || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseTooltipFields(html) {
  const $ = cheerio.load(`<div>${decodeAttr(html)}</div>`);
  /** @type {Record<string, string>} */
  const out = {};
  $("p").each((_, p) => {
    const text = $(p).text().trim();
    const idx = text.indexOf(":");
    if (idx <= 0) return;
    out[text.slice(0, idx).trim().toLowerCase()] = text.slice(idx + 1).trim();
  });
  return out;
}

/**
 * Public homepage swiper cards (EarnlyCash-style user-List-CSM slides).
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchSwiperCsmFeed(source) {
  const res = await fetch(String(source.url || "https://earnlycash.com/"), {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });
  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  const feedType = String(source.feedType || "offer");
  const selector = String(source.slideSelector || ".user-List-CSM.swiper-slide");
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];
  const seen = new Set();

  $(selector).each((_, slide) => {
    const el = $(slide);
    const type = String(el.attr("data-feed-type") || "offer");
    if (feedType !== "all" && type !== feedType) return;

    const user = el.find(".l_p_ti").first().text().trim() || "anonymous";
    const offerwall = el.find(".l_p_ti_1").first().text().trim() || "Offer";
    const amountText = el.find(".pd_amm").first().text().trim();
    const tooltip = parseTooltipFields(el.attr("data-bs-original-title") || "");
    const offerName =
      tooltip.offername ||
      tooltip.name ||
      (type === "cashout" ? "Cashout" : offerwall);
    const wall =
      type === "cashout"
        ? String(tooltip.name || offerwall || "Cashout")
        : offerwall;
    const amount = amountFrom(tooltip.amount || amountText);
    const unit = String(tooltip.amount || amountText).includes("$") ? "USD" : "coins";
    const rawAmount = tooltip.amount || (amountText ? `${amountText} coins` : `${amount} coins`);
    const dataId = el.attr("data-id") || "";
    const userId = el.attr("data-user-id") || "";

    const key = `${user}|${wall}|${offerName}|${amount}|${dataId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const id = crypto.createHash("sha256").update(`${source.id}|${key}`).digest("hex").slice(0, 24);
    events.push({
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user,
      offer: `${wall} → ${offerName}`,
      offerwall: wall,
      offerName,
      country: null,
      isPrivate: false,
      userId,
      amount,
      unit,
      rawAmount,
      at: new Date().toISOString(),
    });
  });

  if (!events.length) throw new Error(`${source.name}: no swiper feed cards found`);
  return events.slice(0, Number(source.limit) || 40);
}
