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

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function relativeToIso(text) {
  const value = String(text || "").toLowerCase();
  const now = Date.now();
  if (!value || value.includes("just now")) return new Date(now).toISOString();
  const match = value.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return new Date(now).toISOString();
  const amount = Number(match[1]);
  const multipliers = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };
  const unit = /** @type {keyof typeof multipliers} */ (match[2]);
  return new Date(now - amount * multipliers[unit]).toISOString();
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

function tooltipHtml(el) {
  return (
    el.attr("data-bs-original-title") ||
    el.attr("data-original-title") ||
    el.attr("data-tippy-content") ||
    el.attr("data-tooltip") ||
    el.attr("title") ||
    ""
  );
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
      "Accept-Language": "en-US,en;q=0.9",
      Referer: String(source.url || "https://earnlycash.com/"),
      "Cache-Control": "no-cache",
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

    const user = cleanText(el.find(".l_p_ti").first().text()) || "anonymous";
    const offerwall = cleanText(el.find(".l_p_ti_1").first().text()) || "Offer";
    const amountText = cleanText(el.find(".pd_amm").first().text());
    const tooltip = parseTooltipFields(tooltipHtml(el));
    const offerName =
      tooltip.offername ||
      tooltip["offer name"] ||
      tooltip.title ||
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
    const timeText =
      tooltip.time ||
      tooltip.date ||
      cleanText(el.text().match(/(?:just now|\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)/i)?.[0] || "");
    const at = relativeToIso(timeText);

    const key = `${user}|${wall}|${offerName}|${amount}|${dataId}|${timeText || "live"}`;
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
      at,
    });
  });

  if (!events.length) throw new Error(`${source.name}: no swiper feed cards found`);
  return events.slice(0, Number(source.limit) || 40);
}
