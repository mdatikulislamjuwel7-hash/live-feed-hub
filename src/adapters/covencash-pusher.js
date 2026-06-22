import crypto from "crypto";
import { getBrowser } from "./apucash-browser.js";
import { fetchPublicLiveFeed } from "./public-live-feed.js";
import { withBrowserLock } from "../browser-lock.js";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function amountFrom(value) {
  const n = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hashId(sourceId, parts) {
  return crypto
    .createHash("sha256")
    .update([sourceId, ...parts].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function firstLeadField(lead, names) {
  for (const name of names) {
    const value = cleanText(lead?.[name]);
    if (value) return value;
  }
  return "";
}

function unwrapPusherLead(frame) {
  let payload = frame;
  if (typeof payload?.data === "string") {
    try {
      payload = { ...payload, data: JSON.parse(payload.data) };
    } catch {
      return null;
    }
  }

  const data = payload?.data;
  const lead = data?.lead || data;
  return lead && typeof lead === "object" ? lead : null;
}

function parsePusherFrame(raw) {
  try {
    const frame = JSON.parse(raw);
    if (!String(frame?.event || "").includes("NewLeadCreated")) return null;
    return unwrapPusherLead(frame);
  } catch {
    return null;
  }
}

function leadToEvent(source, lead) {
  const user = firstLeadField(lead, ["user", "username", "name"]) || "anonymous";
  const offerwall =
    firstLeadField(lead, ["company", "provider", "offerwall", "network"]) || "Offerwall";
  const offerName =
    firstLeadField(lead, [
      "offer_name",
      "offerName",
      "offer",
      "title",
      "campaign_name",
      "campaign",
      "description",
    ]) || `${offerwall} live offer`;
  const amountText =
    firstLeadField(lead, ["offer_points", "points", "amount", "reward", "coins"]) || "0";
  const amount = amountFrom(amountText);
  const at = new Date().toISOString();
  const id = hashId(String(source.id), [
    String(lead.id || user),
    offerwall,
    offerName,
    amountText,
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
    unit: String(source.unit || "coins"),
    rawAmount: `${amount.toLocaleString()} ${String(source.unit || "coins")}`,
    at,
  };
}

async function fetchPusherEvents(source) {
  const listenMs = Number(source.pusherListenMs) || 20000;
  return withBrowserLock(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    const events = [];
    const seen = new Set();

    try {
      const client = await page.target().createCDPSession();
      await client.send("Network.enable");
      client.on("Network.webSocketFrameReceived", ({ response }) => {
        const lead = parsePusherFrame(response?.payloadData || "");
        if (!lead) return;
        const event = leadToEvent(source, lead);
        if (seen.has(event.id)) return;
        seen.add(event.id);
        events.push(event);
      });

      await page.goto(String(source.url), { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((resolve) => setTimeout(resolve, listenMs));
      return events;
    } finally {
      await page.close();
    }
  });
}

/**
 * Covencash only renders offerwall/user/coins in the public HTML. The Echo/Pusher
 * event can carry richer lead fields, so listen briefly and use HTML as fallback.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchCovencashPusher(source) {
  let fallbackError = null;
  const fallbackPromise = fetchPublicLiveFeed({ ...source, type: "public-live-feed" }).catch((err) => {
    fallbackError = err;
    return [];
  });
  const pusherPromise = fetchPusherEvents(source).catch((err) => {
    console.warn(
      `[${source.id}] pusher capture failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  });

  const [fallback, pusher] = await Promise.all([fallbackPromise, pusherPromise]);
  const merged = [];
  const seen = new Set();
  for (const event of [...pusher, ...fallback]) {
    const key = [event.user, event.offerwall, event.offerName, event.rawAmount].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }

  if (!merged.length && fallbackError) throw fallbackError;
  return merged.slice(0, Number(source.limit) || 40);
}
