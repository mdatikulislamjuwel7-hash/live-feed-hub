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

function amount(raw) {
  const num = Number(String(raw || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parses authenticated account history tables:
 * Offer Name, Source, Points, Date.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchAuthHistoryTable(source) {
  const cookie = cookieFor(source);
  if (!cookie) throw new Error(`${source.name}: missing cookie`);

  const res = await fetch(String(source.url), {
    headers: {
      Accept: "text/html",
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 30000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];

  $("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4 || $(tr).hasClass("empty-state-row")) return;

    const offerName = clean($(cells.get(0)).text());
    const offerwall = clean($(cells.get(1)).text()) || "Offer";
    const points = amount($(cells.get(2)).text());
    const dateText = clean($(cells.get(3)).text());
    const at = dateText ? new Date(dateText).toISOString() : new Date().toISOString();
    const id = crypto
      .createHash("sha256")
      .update(`${source.id}|${offerwall}|${offerName}|${points}|${dateText}`)
      .digest("hex")
      .slice(0, 24);

    events.push({
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user: String(source.userLabel || "my account"),
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

  return events.slice(0, Number(source.limit) || 50);
}
