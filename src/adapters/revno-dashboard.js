import crypto from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import * as cheerio from "cheerio";

function cookieFor(source) {
  const envName = String(source.cookieEnv || "").trim();
  if (envName && process.env[envName]) return process.env[envName];
  const file = String(source.cookieFile || "").trim();
  const path = file ? resolve(file) : "";
  if (path && existsSync(path)) return readFileSync(path, "utf8").trim();
  return "";
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberFrom(raw) {
  const num = Number(String(raw || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function idFor(source, parts) {
  return `${source.id}-${crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24)}`;
}

async function fetchHtml(source, url) {
  const cookie = cookieFor(source);
  if (!cookie) throw new Error(`${source.name}: missing cookie`);

  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      Cookie: cookie,
      Referer: "https://revno.net/earn/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 30000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  return res.text();
}

function parseHistory(source, html) {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];

  $("table").each((_, table) => {
    const headers = $(table)
      .find("th")
      .map((__, th) => clean($(th).text()).toLowerCase())
      .get();
    const isEarningTable = headers.includes("offer name") && headers.includes("source") && headers.includes("points");
    if (!isEarningTable) return;

    $(table)
      .find("tbody tr")
      .each((__, tr) => {
        if ($(tr).hasClass("empty-state-row")) return;
        const cells = $(tr).find("td");
        if (cells.length < 4) return;

        const offerName = clean($(cells.get(0)).text());
        const offerwall = clean($(cells.get(1)).text()) || "Offer";
        const points = numberFrom($(cells.get(2)).text());
        const dateText = clean($(cells.get(3)).text());
        const date = Date.parse(dateText);
        const at = Number.isFinite(date) ? new Date(date).toISOString() : now;
        if (!offerName) return;

        events.push({
          id: idFor(source, ["history", offerwall, offerName, points, dateText]),
          source: String(source.id),
          sourceName: String(source.name),
          user: String(source.userLabel || "Revno account"),
          offer: `${offerwall} -> ${offerName}`.slice(0, 140),
          offerwall,
          offerName: offerName.slice(0, 140),
          country: null,
          isPrivate: false,
          amount: points,
          unit: "points",
          rawAmount: `${points.toLocaleString()} points`,
          at,
        });
      });
  });

  return events;
}

function parseDashboard(source, html) {
  const $ = cheerio.load(html);
  const now = new Date().toISOString();
  /** @type {import('../types.js').FeedEvent[]} */
  const withdrawalEvents = [];
  /** @type {import('../types.js').FeedEvent[]} */
  const offerwallEvents = [];

  $(".withdraw-item").each((index, el) => {
    const value = clean($(el).text());
    const match = value.match(/^(.+?)\s*-\s*\$?([0-9.]+)\s*([A-Z]+)?/i);
    if (!match) return;
    const user = clean(match[1]);
    const amount = numberFrom(match[2]);
    const unit = clean(match[3] || "USD");

    withdrawalEvents.push({
      id: idFor(source, ["withdraw", index, user, amount, unit]),
      source: String(source.id),
      sourceName: String(source.name),
      user,
      offer: "Latest Withdrawal",
      offerwall: "Withdrawal",
      offerName: "Latest Withdrawal",
      country: null,
      isPrivate: false,
      amount,
      unit,
      rawAmount: `$${amount.toLocaleString()} ${unit}`,
      at: now,
    });
  });

  $(".offers-card").each((_, el) => {
    const text = clean($(el).text());
    const boost = text.match(/\+?\s*([0-9]+(?:\.[0-9]+)?)\s*%/)?.[1] || "0";
    const name = clean(text.replace(/Level\s+\d+/i, "").replace(/\+?\s*[0-9]+(?:\.[0-9]+)?\s*%/g, ""));
    if (!name) return;

    offerwallEvents.push({
      id: idFor(source, ["offerwall", name, boost, $(el).attr("data-status") || ""]),
      source: String(source.id),
      sourceName: String(source.name),
      user: String(source.userLabel || "Revno account"),
      offer: `${name} offerwall boost`,
      offerwall: name,
      offerName: `${name} offerwall boost`,
      country: null,
      isPrivate: false,
      amount: numberFrom(boost),
      unit: "boost",
      rawAmount: `+${boost}% boost`,
      at: now,
    });
  });

  return [...offerwallEvents, ...withdrawalEvents.slice(0, Number(source.withdrawLimit) || 40)];
}

/**
 * Parses Revno's authenticated dashboard and history pages using a user-provided session.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchRevnoDashboard(source) {
  const dashboardHtml = await fetchHtml(source, String(source.url || "https://revno.net/earn/"));
  const historyUrl = String(source.historyUrl || "https://revno.net/earn/history.php");
  const historyHtml = await fetchHtml(source, historyUrl).catch(() => "");
  const events = [...parseHistory(source, historyHtml), ...parseDashboard(source, dashboardHtml)];

  return events.slice(0, Number(source.limit) || 60);
}
