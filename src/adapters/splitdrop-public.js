import crypto from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
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

function cookieFor(source) {
  const envName = String(source.cookieEnv || "").trim();
  if (envName && process.env[envName]) return process.env[envName];
  const file = String(source.cookieFile || "").trim();
  const path = file ? resolve(file) : "";
  if (path && existsSync(path)) return readFileSync(path, "utf8").trim();
  return "";
}

async function fetchHtml(url, source, cookie = "", extraHeaders = {}) {
  const headers = {
    Accept: "text/html",
    Referer: "https://splitdrop.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
    ...extraHeaders,
  };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  return res.text();
}

function splitdropAjaxHeaders(csrf) {
  return {
    Accept: "*/*",
    Origin: "https://splitdrop.com",
    Referer: "https://splitdrop.com/",
    "X-CSRF-TOKEN": csrf,
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}

function parseRecentEarners(html, source) {
  const $ = cheerio.load(html);
  const at = new Date().toISOString();

  return $(".user-detail")
    .toArray()
    .map((el) => {
      const card = $(el);
      const userId = card.attr("onclick")?.match(/showMiniProfile\(([^)]+)/)?.[1]?.replace(/[^0-9]/g, "") || "";
      const partner = card.find(".user-detail-desc h5").first().text().replace(/\s+/g, " ").trim() || "Partner";
      const user = card.find(".user-detail-desc p").first().text().replace(/\s+/g, " ").trim() || "Splitdrop user";
      const amountText = card.find(".user-detail-money").text().replace(/\s+/g, "").trim();
      const amount = asNumber(amountText);
      const id = hashId(String(source.id), ["recent", userId || user, partner, amount]);

      return {
        id: `${source.id}-${id}`,
        source: String(source.id),
        sourceName: String(source.name),
        user,
        userId,
        offer: truncate(`${partner} -> Recent earner`),
        offerwall: partner,
        offerName: "Recent earner",
        country: null,
        isPrivate: false,
        amount,
        unit: "usd",
        rawAmount: amount > 0 ? `$${amount.toFixed(2)}` : "$0.00",
        at,
      };
    })
    .filter((event) => event.user && event.amount > 0);
}

async function fetchAuthenticatedRecent(source, cookie) {
  const homeHtml = await fetchHtml("https://splitdrop.com/", source, cookie);
  if (!/logout|userDataCookey|Profile Wallet/i.test(homeHtml)) return [];
  const csrf = cheerio.load(homeHtml)('meta[name="csrf-token"]').attr("content") || "";
  const html = await fetchHtml(
    "https://splitdrop.com/recentEarners",
    source,
    cookie,
    splitdropAjaxHeaders(csrf)
  );
  return parseRecentEarners(html, source).slice(0, Number(source.limit) || 30);
}

/**
 * Splitdrop's public guest pages do not expose the private/recent earner feed,
 * but the offers page renders public featured offers server-side.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchSplitdropPublic(source) {
  const cookie = cookieFor(source);
  if (cookie) {
    const recent = await fetchAuthenticatedRecent(source, cookie);
    if (recent.length) return recent;
  }

  const url = String(source.url || "https://splitdrop.com/offers.html");
  const $ = cheerio.load(await fetchHtml(url, source));
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
