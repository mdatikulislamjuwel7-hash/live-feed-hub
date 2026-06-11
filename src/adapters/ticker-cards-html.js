import crypto from "crypto";
import * as cheerio from "cheerio";

function amountFrom(text) {
  const n = Number(String(text || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function htmlToText(value) {
  const raw = String(value || "");
  if (!raw) return "";
  return cleanText(cheerio.load(raw).text() || raw);
}

function tooltipValue(text, label) {
  const pattern = new RegExp(`${label}\\s*[:\\-]\\s*([^|\\n]+)`, "i");
  return cleanText(text.match(pattern)?.[1] || "");
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

function splitOfferName(value, fallbackWall) {
  const text = cleanText(value);
  if (!text) return null;
  const parts = text.split(/\s+(?:-|→|—)\s+/).map(cleanText).filter(Boolean);
  if (parts.length >= 2) {
    return {
      offerwall: parts[0],
      offerName: parts.slice(1).join(" - "),
    };
  }
  if (fallbackWall && text.toLowerCase() === String(fallbackWall).toLowerCase()) return null;
  return {
    offerwall: fallbackWall,
    offerName: text,
  };
}

function attrOfferDetails($, el, fallbackWall) {
  const candidates = [
    el.attr("data-bs-original-title"),
    el.attr("data-original-title"),
    el.attr("data-tippy-content"),
    el.attr("data-tooltip"),
    el.attr("data-content"),
    el.attr("data-title"),
    el.attr("aria-label"),
    el.attr("title"),
    el.attr("x-tooltip"),
  ].map(htmlToText).filter(Boolean);

  for (const text of candidates) {
    const named =
      tooltipValue(text, "Offer Name") ||
      tooltipValue(text, "Offername") ||
      tooltipValue(text, "Offer Title") ||
      tooltipValue(text, "Title") ||
      tooltipValue(text, "Name") ||
      tooltipValue(text, "Offer");
    const wall = tooltipValue(text, "Offerwall") || fallbackWall;
    const parsed = splitOfferName(named, wall);
    if (parsed?.offerName) return parsed;
  }

  const hiddenText = cleanText(
    el
      .find("[class*='tooltip'],[class*='hidden'],[style*='display: none'],[style*='display:none']")
      .text()
  );
  const hiddenName =
    tooltipValue(hiddenText, "Offer Name") ||
    tooltipValue(hiddenText, "Offername") ||
    tooltipValue(hiddenText, "Name") ||
    tooltipValue(hiddenText, "Offer");
  return splitOfferName(hiddenName, fallbackWall);
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
    const user = cleanText(el.find("p.font-medium").first().text());
    const row = el.find(".flex.w-full.items-center.gap-2").first();
    let offerwall = cleanText(row.find("span.text-xs").first().text()) || "Offer";
    const amountText =
      cleanText(row.find("span.flex span").last().text()) ||
      cleanText(row.find("span").last().text());
    if (!user) return;

    const amount = amountFrom(amountText);
    const details = attrOfferDetails($, el, offerwall);
    if (details?.offerwall) offerwall = details.offerwall;
    const offerName = details?.offerName || (isWithdraw ? `${offerwall} withdrawal` : `${offerwall} reward`);
    const timeText = cleanText(
      el.text().match(/(?:just now|\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)/i)?.[0] || ""
    );
    const at = relativeToIso(timeText);
    const key = `${user}|${offerwall}|${offerName}|${amountText}|${timeText || "live"}|${isWithdraw ? "w" : "o"}`;
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
      at,
    });
  });

  if (!events.length) throw new Error(`${source.name}: no ticker cards found`);
  return events.slice(0, Number(source.limit) || 40);
}
