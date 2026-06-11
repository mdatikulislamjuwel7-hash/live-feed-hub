import crypto from "crypto";
import * as cheerio from "cheerio";
import { Agent } from "undici";

function text($, el) {
  return $(el).text().replace(/\s+/g, " ").trim();
}

function parseAmount(raw) {
  const num = Number(String(raw || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function parseOffer(raw) {
  const value = String(raw || "")
    .replace(/&lt;br\s*\/?&gt;/gi, " ")
    .replace(/<br\s*\/?>/gi, " ");
  const cleaned = cheerio.load(value).root().text().replace(/\s+/g, " ").trim();
  const wall =
    cleaned.match(/^([^:]+):\s*Offername:/i)?.[1]?.trim() ||
    cleaned.match(/^(.+?)\s+offerwall\s+Credit/i)?.[1]?.trim() ||
    cleaned.match(/^(.+?)\s+offerwall/i)?.[1]?.trim() ||
    "";
  const name =
    cleaned.match(/offer\s*name\s*:\s*(.+?)(?:\s*\.\s*IP:|$)/i)?.[1]?.trim() ||
    cleaned.match(/Offername:\s*(.+?)(?:\s*\.\s*IP:|$)/i)?.[1]?.trim() ||
    cleaned.match(/\bCredit:\s*(.+?)(?:\s*IP\s*:|$)/i)?.[1]?.trim() ||
    cleaned.replace(/\s+IP\s*:\s*.+$/i, "").trim();
  const cleanName = name
    .replace(/&lt;[^&]+&gt;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^.+?\bofferwall\s+Credit:\s*/i, "")
    .replace(/^.+?\bofferwall\s*/i, "")
    .replace(/\s+IP\s*:\s*.+$/i, "")
    .trim();
  return {
    offerwall: wall || "Offer",
    offerName: cleanName || "Offer",
  };
}

function makeDispatcher(source) {
  if (!source.insecureTls) return undefined;
  return new Agent({ connect: { rejectUnauthorized: false } });
}

/**
 * Parses simple public Live.php tables with columns:
 * User ID, Amount, Offer Name, OFFER WALL, IP Address.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchLiveTable(source) {
  const res = await fetch(String(source.url), {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    dispatcher: makeDispatcher(source),
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 30000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);

  const $ = cheerio.load(await res.text());
  const now = new Date().toISOString();
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];

  $("tbody tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4) return;

    const user = text($, cells.get(0));
    const amount = parseAmount(text($, cells.get(1)));
    const rawOfferHtml = $(cells.get(2)).html() || text($, cells.get(2));
    const wallCell = text($, cells.get(3));
    const parsed = parseOffer(rawOfferHtml);
    const offerwall = wallCell && wallCell !== "0" ? wallCell : parsed.offerwall;
    const offerName = parsed.offerName;
    if (!user || !offerName) return;

    const id = crypto
      .createHash("sha256")
      .update(`${source.id}|${user}|${offerwall}|${offerName}|${amount}`)
      .digest("hex")
      .slice(0, 24);

    events.push({
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user,
      offer: `${offerwall} -> ${offerName}`.slice(0, 140),
      offerwall,
      offerName: offerName.slice(0, 140),
      country: null,
      isPrivate: false,
      amount,
      unit: String(source.unit || "points"),
      rawAmount: `${amount.toLocaleString()} ${source.unit || "points"}`,
      at: now,
    });
  });

  return events.slice(0, Number(source.limit) || 50);
}
