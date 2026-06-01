import crypto from "crypto";
import { getBrowser } from "./apucash-browser.js";
import { withBrowserLock } from "../browser-lock.js";
import {
  collectEarnFeed,
  fetchUserDetailsBatch,
  formatCountry,
} from "./paidcash-socket.js";

/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchPaidcash(source) {
  try {
    return await fetchPaidcashSocket(source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (source.useBrowserFallback === true) {
      console.warn(`[paidcash] socket failed (${msg}), browser fallback`);
      return withBrowserLock(() => fetchPaidcashBrowser(source));
    }
    throw new Error(`PaidCash socket failed: ${msg}`);
  }
}

/**
 * @param {Record<string, unknown>} source
 */
async function fetchPaidcashSocket(source) {
  const rows = await collectEarnFeed(3000, 1);
  const profiles = source.enrichProfiles === true
    ? await fetchUserDetailsBatch(rows.map((r) => r.userId).filter(Boolean))
    : new Map();
  const events = buildEvents(source, rows, profiles);
  return events;
}

/**
 * @param {Record<string, unknown>} source
 */
async function fetchPaidcashBrowser(source) {
  const url = String(source.url || "https://paidcash.co");
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 8000));

    const rows = await page.evaluate(async () => {
      const items = [...document.querySelectorAll(".earnFeed-item")];
      const out = [];
      for (const item of items) {
        item.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 350));
        const tip = document.querySelector(".feed-tooltip");
        const els = tip
          ? [...tip.querySelectorAll(".primary-feed-tooltip-el")].map((p) =>
              p.textContent.trim()
            )
          : [];
        const offerwall =
          els[0] ||
          item.querySelector(".earning-feed-item-content-title")?.textContent?.trim() ||
          "";
        const user =
          item.querySelector(".earning-feed-item-content-description")?.textContent?.trim() ||
          "";
        const amountText =
          item.querySelector(".earning-feed-item-reward-amount")?.textContent?.trim() ||
          "0";
        const amount = parseFloat(amountText.replace(/,/g, "")) || 0;
        const userId = item.getAttribute("data-user") || "";
        const feedKey = item.id || `${user}|${offerwall}|${amountText}`;
        const offername = els[1] || null;
        if (offerwall && user) {
          out.push({
            id: feedKey.replace(/^earnFeed-/, "") || feedKey,
            wall: offerwall,
            offername,
            username: user,
            userId,
            coins: amount,
            feedType: "earn",
          });
        }
        item.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
      }
      return out;
    });

    const profiles = await fetchUserDetailsBatch(
      rows.map((r) => r.userId).filter(Boolean)
    );
    const events = buildEvents(source, rows, profiles);
    console.log(`[paidcash] browser: ${events.length} items`);
    return events;
  } finally {
    await page.close();
  }
}

/**
 * @param {string|null} offerName
 * @param {string[]} patterns
 */
function isBlockedOffer(offerName, patterns) {
  if (!offerName || !patterns.length) return false;
  const n = offerName.toLowerCase();
  return patterns.some((p) => n.includes(String(p).toLowerCase()));
}

/**
 * @param {Record<string, unknown>} source
 * @returns {string[]}
 */
function getBlockPatterns(source) {
  const raw = source.blockOfferPatterns;
  if (!Array.isArray(raw)) return ["MM Quiz", "Watch More"];
  return raw.map((p) => String(p).trim()).filter(Boolean);
}

/**
 * @param {Record<string, unknown>} source
 * @param {Record<string, unknown>[]} rows
 * @param {Map<string, { userId: number, username?: string, profileVisible?: boolean, country?: string }>} profiles
 */
function buildEvents(source, rows, profiles) {
  const now = new Date().toISOString();
  const events = [];
  const blockPatterns = getBlockPatterns(source);
  let skipped = 0;
  let withCountry = 0;
  let withOffer = 0;

  for (const row of rows) {
    if (events.length >= 40) break;

    const offerwall = String(row.wall ?? "").trim();
    const offerName = String(row.offername ?? "").trim() || null;
    const user = String(row.username ?? "").trim();
    const userId = String(row.userId ?? "");
    const feedId = String(row.id ?? "");
    const amount = parseFloat(String(row.coins ?? "0").replace(/,/g, "")) || 0;

    if (!offerwall || !user || row.feedType !== "earn") continue;
    if (isBlockedOffer(offerName, blockPatterns)) {
      skipped++;
      continue;
    }

    const profile = profiles.get(userId);
    const country = formatCountry(profile?.country);
    if (country) withCountry++;
    if (offerName) withOffer++;

    const isPrivate = profile?.profileVisible === false;
    const offer = offerName
      ? `${offerwall} → ${offerName}`
      : `${offerwall} → @${user}`;

    const id = feedId
      ? `${source.id}-${feedId}`
      : `${source.id}-${crypto
          .createHash("sha256")
          .update(`${user}|${offerwall}|${offerName}|${amount}`)
          .digest("hex")
          .slice(0, 24)}`;

    events.push({
      id,
      source: /** @type {string} */ (source.id),
      sourceName: /** @type {string} */ (source.name),
      user,
      offer: offer.length > 120 ? `${offer.slice(0, 117)}...` : offer,
      offerwall,
      offerName,
      country,
      isPrivate,
      userId: userId || undefined,
      amount,
      unit: "coins",
      rawAmount: `${amount} coins`,
      at: now,
    });
  }

  console.log(
    `[paidcash] ${events.length} items (${withOffer} offers, ${withCountry} countries${skipped ? `, ${skipped} blocked` : ""})`
  );
  return events;
}
