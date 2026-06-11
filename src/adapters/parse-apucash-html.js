import * as cheerio from "cheerio";
import crypto from "crypto";
import { getDailyTaskLabel } from "./apucash-daily-tasks.js";
import { matchActivity } from "./apucash-profiles.js";

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {import('cheerio').Cheerio<import('cheerio').Element>} block
 */
export function extractOfferDetail($, block) {
  const header = block.find(".offer_stat-header").first();
  const smallLine = header.find("p[style*='10px']").first().text().trim();

  let offerImageAlt = "";
  header.find("img").each((_, img) => {
    const src = $(img).attr("src") || "";
    if (src.includes("/uploads/users/")) return;
    const alt = ($(img).attr("alt") || "").trim();
    if (alt && alt.length > 2 && alt !== $(block).find("p.hd").text().trim()) {
      offerImageAlt = alt;
    }
  });

  if (smallLine) return { offerName: smallLine, source: "ticker" };
  if (offerImageAlt) return { offerName: offerImageAlt, source: "image" };
  return { offerName: "", source: "" };
}

/**
 * @param {string} html
 * @param {Record<string, unknown>} source
 * @param {Map<string, import('./apucash-profile-types.js').UserProfile>} [profiles]
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function parseApucashHtml(html, source, profiles) {
  const $ = cheerio.load(html);
  const events = [];
  const now = new Date().toISOString();

  let wrappers = $("#last_offers [wire\\:key^='offer-']");
  if (!wrappers.length) {
    wrappers = $("[wire\\:key^='offer-']");
  }
  for (let i = 0; i < wrappers.length; i++) {
    const wrapper = $(wrappers[i]);
    const block = wrapper.find(".offer-wrapper").first();
    if (!block.length) continue;

    const wireKey = wrapper.attr("wire:key") || "";
    const offerwall = block.find(".offer_stat-footer h6").first().text().trim();
    const user = block.find(".offer_stat-footer p.hd").first().text().trim();
    const amountText = block.find(".offer-amount p").first().text().trim();

    if (!offerwall || !user) continue;

    const htmlChunk = wrapper.html() || "";
    const userIdMatch = htmlChunk.match(/userId':\s*'(\d+)'/);
    const userId = userIdMatch?.[1] || "";

    const coinMatch = amountText.match(/([\d,]+)/);
    const amount = coinMatch
      ? parseFloat(coinMatch[1].replace(/,/g, ""))
      : 0;

    const profile = userId && profiles?.get(userId);
    const country = profile?.country || "";

    let offerName = "";
    let isPrivate = false;

    if (profile?.isPrivate) {
      isPrivate = true;
      offerName = "Private offer";
    } else if (profile) {
      const act = matchActivity(profile, offerwall, amount);
      if (act) offerName = act.offerName;
    }

    if (!offerName) {
      const detail = extractOfferDetail($, block);
      offerName = detail.offerName;
    }

    if (!offerName && offerwall === "Daily Tasks") {
      const taskLabel = await getDailyTaskLabel(amount);
      if (taskLabel) offerName = taskLabel;
    }

    if (!offerName && amount > 0) {
      offerName = `${amount} coin reward`;
    } else if (!offerName && amount === 0) {
      offerName = "Pending / no credit yet";
    }

    const displayOffer = isPrivate
      ? `${offerwall} → 🔒 Private offer`
      : offerName
        ? `${offerwall} → ${offerName}`
        : offerwall;

    const id = crypto
      .createHash("sha256")
      .update(`${source.id}|${wireKey}|${user}|${offerwall}|${amountText}`)
      .digest("hex")
      .slice(0, 24);

    events.push({
      id: `${source.id}-${id}`,
      source: source.id,
      sourceName: source.name,
      user,
      offer: displayOffer,
      offerwall,
      offerName: offerName || null,
      country: country || null,
      isPrivate,
      userId,
      amount,
      unit: "coins",
      rawAmount: amountText || `${amount}💰`,
      at: now,
    });
  }

  if (events.length === 0) {
    throw new Error(`${source.name}: no ticker items in HTML`);
  }

  return events.slice(0, 35);
}
