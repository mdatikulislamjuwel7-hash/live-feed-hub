import crypto from "crypto";
import * as cheerio from "cheerio";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function hashId(sourceId, parts) {
  return crypto
    .createHash("sha256")
    .update([sourceId, ...parts].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function parseLeadSource(text) {
  const cleaned = cleanText(text);
  const match = cleaned.match(/^(.+?)\s-\s(.+?)\s*\(\d+\)$/);
  if (!match) return { offerwall: "Offer", offerName: cleaned };
  return { offerwall: match[1].trim(), offerName: match[2].trim() };
}

/**
 * @param {Record<string, unknown>} winner
 */
function parseWinner(winner, source) {
  const user = cleanText(winner.name) || "anonymous";
  const amount = Number(winner.coins) || 0;
  const sourceType = cleanText(winner.source_type);
  const sourceText = cleanText(winner.source);
  const tooltip = /** @type {Record<string, string>} */ (winner.tooltip || {});
  const at = relativeToIso(tooltip.time);

  let offerwall = cleanText(winner.source_label) || sourceType || "Offer";
  let offerName = cleanText(tooltip.description) || sourceText;

  if (sourceType === "Lead") {
    ({ offerwall, offerName } = parseLeadSource(sourceText));
  } else if (sourceType === "DailyTaskProgress") {
    offerwall = "Daily Tasks";
    offerName = sourceText.replace(/^Daily task:\s*/i, "").trim() || sourceText;
  } else if (sourceType === "StreakClaim") {
    offerwall = "Daily streak";
    offerName = sourceText;
  } else if (sourceType === "LevelUp") {
    offerwall = "Level up";
    offerName = sourceText;
  } else if (sourceType === "SpinLog") {
    offerwall = "Spin";
    offerName = sourceText;
  }

  const id = hashId(String(source.id), [
    String(winner.id || user),
    offerwall,
    offerName,
    amount,
    at.slice(0, 16),
  ]);

  return {
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
    rawAmount: `${amount.toLocaleString()}💰`,
    at,
  };
}

/**
 * @param {string} html
 */
function extractRecentWinners(html) {
  const $ = cheerio.load(html);
  const payload = $("script[type='application/json']")
    .toArray()
    .map((el) => $(el).html() || "")
    .find((text) => text.includes('"recentWinners"'));

  if (!payload) {
    throw new Error("ApuCash: no Inertia recentWinners payload");
  }

  const page = JSON.parse(payload);
  const winners = page?.props?.recentWinners;
  if (!Array.isArray(winners) || !winners.length) {
    throw new Error("ApuCash: recentWinners empty");
  }

  return winners;
}

async function fetchHomeHtml(source, url) {
  const retries = Math.max(0, Number(source.fetchRetries) || 0);
  const timeoutMs = Number(source.timeoutMs) || 30000;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/html",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await wait(750 * (attempt + 1));
    }
  }

  throw lastError;
}

/**
 * ApuCash dashboard now ships recent activity in an Inertia JSON script.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchApucashInertia(source) {
  const url = String(source.url || "https://apucash.com");
  const html = await fetchHomeHtml(source, url);
  const winners = extractRecentWinners(html);
  const events = winners.map((winner) => parseWinner(winner, source));
  const named = events.filter((event) => event.offerName && !String(event.offerName).includes("coin reward"));
  console.log(`[apucash] inertia: ${events.length} items, ${named.length} named`);
  return events.slice(0, Number(source.limit) || 35);
}
