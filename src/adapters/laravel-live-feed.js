import crypto from "crypto";
import * as cheerio from "cheerio";

function hashId(sourceId, parts) {
  return crypto
    .createHash("sha256")
    .update([sourceId, ...parts].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function decodeAttr(value = "") {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'");
}

function asNumber(value) {
  const num = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function truncate(text, max = 120) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function relativeToIso(text) {
  const value = String(text || "").toLowerCase();
  const now = Date.now();
  if (!value || value.includes("just now")) return new Date(now).toISOString();
  const match = value.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return new Date(now).toISOString();
  const amount = Number(match[1]);
  const multipliers = {
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

function parseTooltip(html, labels) {
  const $ = cheerio.load(String(html || ""));
  const text = $("body").text().replace(/\s+/g, " ").trim();
  /** @type {Record<string, string>} */
  const out = {};
  const patterns = {
    Username: /Username:\s*(.+?)(?=\s+Name:|\s+Amount:|\s+Withdrawal:|\s+Offer Name:|\s+Offerwall:|$)/i,
    Name: /\bName:\s*(.+?)(?=\s+Amount:|\s+Withdrawal:|\s+Offer Name:|\s+Offerwall:|$)/i,
    Amount: /Amount:\s*(.+?)$/i,
    Withdrawal: /Withdrawal:\s*(.+?)(?=\s+Amount:|$)/i,
    "Offer Name": /Offer Name:\s*(.+?)(?=\s+Offerwall:|\s+Amount:|$)/i,
    Offerwall: /Offerwall:\s*(.+?)(?=\s+Amount:|$)/i,
  };
  for (const label of labels) {
    out[label] = text.match(patterns[label] || new RegExp(`${label}:\\s*(.+)$`, "i"))?.[1]?.trim() || "";
  }
  return out;
}

function tooltipHtml($el) {
  return (
    $el.attr("title") ||
    $el.attr("data-bs-original-title") ||
    $el.attr("data-original-title") ||
    $el.attr("data-tippy-content") ||
    ""
  );
}

function splitOfferName(raw) {
  const cleaned = String(raw || "Offer").trim();
  const parts = cleaned.split(/\s+-\s+/);
  if (parts.length < 2) return { offerwall: cleaned || "Offer", offerName: cleaned || "Offer" };
  return { offerwall: parts.shift() || "Offer", offerName: parts.join(" - ") || "Offer" };
}

/**
 * @param {string} url
 */
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cookie = (res.headers.getSetCookie?.() || [])
    .map((item) => item.split(";")[0])
    .join("; ");
  return { html: await res.text(), cookie, finalUrl: res.url || url };
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} snapshot
 * @param {string} cookie
 * @param {string} pageUrl
 * @param {string} csrf
 * @param {string} token
 * @param {{ path: string, method: string, params: unknown[] }[]} calls
 */
async function runLivewireCalls(source, snapshot, cookie, pageUrl, csrf, token, calls) {
  const origin = new URL(String(source.url)).origin;
  let current = snapshot;
  let effectsHtml = "";

  for (const call of calls) {
    const res = await fetch(`${origin}/livewire/update`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-CSRF-TOKEN": csrf,
        "X-XSRF-TOKEN": token,
        "X-Livewire": "",
        Cookie: cookie,
        Origin: origin,
        Referer: pageUrl,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        _token: csrf,
        components: [{ snapshot: current, updates: {}, calls: [call] }],
      }),
      signal: AbortSignal.timeout(Number(source.timeoutMs) || 30000),
    });
    if (!res.ok) throw new Error(`${source.name}: Livewire HTTP ${res.status}`);
    const json = await res.json();
    current = json?.components?.[0]?.snapshot || current;
    effectsHtml = json?.components?.[0]?.effects?.html || effectsHtml;
  }

  return { html: effectsHtml, snapshot: current };
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} html
 * @param {string} cookie
 * @param {string} pageUrl
 * @param {string} componentMatch
 * @param {{ path: string, method: string, params: unknown[] }[]} [extraCalls]
 */
async function livewireUpdate(source, html, cookie, pageUrl, componentMatch, extraCalls = []) {
  const $ = cheerio.load(html);
  const csrf = $('meta[name="csrf-token"]').attr("content") || "";
  const component = $("[wire\\:snapshot]")
    .toArray()
    .map((el) => ({
      snapshot: $(el).attr("wire:snapshot") || "",
      intersect: $(el).attr("x-intersect") || "",
    }))
    .find((item) => decodeAttr(item.snapshot).includes(componentMatch));

  if (!component) {
    throw new Error(`${source.name}: Livewire component "${componentMatch}" not found`);
  }

  const snapshot = decodeAttr(component.snapshot);
  const lazyPayload = decodeAttr(component.intersect).match(/__lazyLoad\('([^']+)/)?.[1];
  const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
  const token = xsrf ? decodeURIComponent(xsrf) : csrf;

  /** @type {{ path: string, method: string, params: unknown[] }[]} */
  const calls = [];
  if (lazyPayload) {
    calls.push({ path: "", method: "__lazyLoad", params: [lazyPayload] });
  }
  calls.push(...extraCalls);

  return runLivewireCalls(source, snapshot, cookie, pageUrl, csrf, token, calls);
}

/**
 * @param {unknown[]} liveLeadsRaw
 */
function unwrapLivewireArray(liveLeadsRaw) {
  if (!Array.isArray(liveLeadsRaw)) return [];
  const top = liveLeadsRaw[0];
  if (!Array.isArray(top)) {
    return liveLeadsRaw.filter(
      (row) => row && typeof row === "object" && !("s" in row) && "user" in row
    );
  }
  return top
    .map((pair) => (Array.isArray(pair) ? pair[0] : pair))
    .filter((row) => row && typeof row === "object" && !("s" in row) && "user" in row);
}

/**
 * @param {Record<string, unknown>[]} leads
 * @param {Record<string, unknown>} source
 */
function parseLiveLeads(leads, source) {
  const coinRatio = Number(source.coinRatio) || 1000;
  return leads.map((lead) => {
    const user = String(lead.user || "anonymous");
    const isCashout = Boolean(lead.is_cashout);
    const offerwall = isCashout ? "Cashout" : String(lead.provider || "Offer");
    const offerName = String(lead.offer_name || "Offer");
    const reward = asNumber(lead.reward);
    const created = lead.created_at;
    let at = new Date().toISOString();
    if (Array.isArray(created) && typeof created[0] === "string") {
      at = created[0];
    } else if (typeof lead.timestamp === "number") {
      at = new Date(lead.timestamp * 1000).toISOString();
    }

    const id = hashId(String(source.id), [
      String(lead.id || user),
      offerwall,
      offerName,
      reward,
      at,
    ]);

    return {
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user,
      offer: truncate(`${offerwall} → ${offerName}`),
      offerwall,
      offerName: truncate(offerName),
      country: null,
      isPrivate: false,
      amount: reward,
      unit: "points",
      rawAmount: `${reward.toLocaleString()} points ($${(reward / coinRatio).toFixed(2)})`,
      at,
    };
  });
}

/**
 * @param {string} html
 * @param {Record<string, unknown>} source
 */
function parseLiveCashoutCards(html, source) {
  const $ = cheerio.load(html);
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];
  const seen = new Set();

  $(".fade-in-scale, .swiper-slide").each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    if (!text || text.length < 4) return;

    const tooltip = parseTooltip(tooltipHtml($el), [
      "Username",
      "Name",
      "Amount",
      "Withdrawal",
      "Offer Name",
      "Offerwall",
    ]);
    const user = tooltip.Username || text.split(/\s+/)[0] || "anonymous";
    const amountText = tooltip.Amount || "";
    const amount = asNumber(amountText);
    const timeText =
      text.match(/(?:just now|\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/i)?.[0] || "";

    let offerwall = "Offer";
    let offerName = "Live reward";
    if (tooltip["Offer Name"] || tooltip.Offerwall) {
      offerwall = tooltip.Offerwall || "Offer";
      offerName = tooltip["Offer Name"] || "Offer";
    } else if (tooltip.Name) {
      ({ offerwall, offerName } = splitOfferName(tooltip.Name));
    } else if (tooltip.Withdrawal) {
      offerwall = "Cashout";
      offerName = tooltip.Withdrawal;
    } else {
      const imgAlt =
        $el
          .find("img")
          .toArray()
          .map((img) => $(img).attr("alt") || "")
          .find(Boolean) || "";
      if (imgAlt) ({ offerwall, offerName } = splitOfferName(imgAlt));
    }

    const semantic = [user, offerwall, offerName, amount].map((part) => String(part).toLowerCase().trim()).join("|");
    if (seen.has(semantic)) return;
    seen.add(semantic);

    const id = hashId(String(source.id), [user, offerwall, offerName, amount]);
    events.push({
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user: user.length > 22 ? `${user.slice(0, 22)}...` : user,
      offer: truncate(`${offerwall} → ${offerName}`),
      offerwall,
      offerName: truncate(offerName),
      country: null,
      isPrivate: false,
      amount,
      unit: amountText.includes("$") ? "USD" : "points",
      rawAmount: amountText || `${amount.toLocaleString()} points`,
      at: relativeToIso(timeText),
    });
  });

  return events;
}

/**
 * @param {string} html
 * @param {Record<string, unknown>} source
 */
function parseCashoutItems(html, source) {
  const $ = cheerio.load(html);
  /** @type {import('../types.js').FeedEvent[]} */
  const events = [];

  $(".cashout_item").each((_, el) => {
    const $el = $(el);
    const user = $el.find(".username").first().text().replace(/\s+/g, " ").trim() || "anonymous";
    const timeText = $el.find(".time").first().text().replace(/\s+/g, " ").trim();
    const method = $el.find(".cashout_method img").attr("alt") || "Withdrawal";
    const amountMatch =
      $el.text().match(/\$[\d,.]+/) ||
      $el.text().match(/[\d,]+\s*(?:coins|points)/i) ||
      [];
    const amountText = amountMatch[0] || "0";
    const amount = asNumber(amountText);
    const id = hashId(String(source.id), [user, method, amountText, timeText]);

    events.push({
      id: `${source.id}-${id}`,
      source: String(source.id),
      sourceName: String(source.name),
      user,
      offer: truncate(`Cashout → ${method}`),
      offerwall: "Cashout",
      offerName: method,
      country: null,
      isPrivate: false,
      amount,
      unit: amountText.includes("$") ? "USD" : "points",
      rawAmount: amountText,
      at: relativeToIso(timeText),
    });
  });

  return events;
}

/**
 * @param {Record<string, unknown>} source
 */
async function fetchLiveLeads(source) {
  const component = String(source.livewireComponent || "user.widget.live-lead");
  const refreshMethod = String(source.refreshMethod || "refreshLiveLeAD");
  const { html, cookie, finalUrl } = await fetchPage(String(source.url));
  const first = await livewireUpdate(source, html, cookie, finalUrl, component, [
    { path: "", method: refreshMethod, params: [] },
  ]);
  const snap = JSON.parse(decodeAttr(first.snapshot));
  const leads = unwrapLivewireArray(snap?.data?.liveLeads);
  if (!leads.length) throw new Error(`${source.name}: no live leads returned`);
  return parseLiveLeads(leads, source);
}

/**
 * @param {Record<string, unknown>} source
 */
async function fetchLiveCashouts(source) {
  const component = String(source.livewireComponent || "user.live-cashouts");
  const { html, cookie, finalUrl } = await fetchPage(String(source.url));
  const { html: lwHtml } = await livewireUpdate(source, html, cookie, finalUrl, component);
  const events = parseLiveCashoutCards(lwHtml, source);
  if (!events.length) throw new Error(`${source.name}: no live cashout cards`);
  return events;
}

/**
 * @param {Record<string, unknown>} source
 */
async function fetchCashoutList(source) {
  const component = String(source.livewireComponent || "live-cashout-list");
  const { html, cookie, finalUrl } = await fetchPage(String(source.url));
  const $ = cheerio.load(html);
  let events = parseCashoutItems($.html(), source);
  if (events.length) return events;

  const { html: lwHtml } = await livewireUpdate(source, html, cookie, finalUrl, component);
  events = parseCashoutItems(lwHtml, source);
  if (!events.length) throw new Error(`${source.name}: no cashout items`);
  return events;
}

/**
 * Laravel Livewire live feed (EarnG live leads, GainCash live offers/cashouts).
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchLaravelLiveFeed(source) {
  const mode = String(source.laravelMode || "live-leads");
  let events = [];

  if (mode === "live-leads") events = await fetchLiveLeads(source);
  else if (mode === "live-cashouts") events = await fetchLiveCashouts(source);
  else if (mode === "cashout-list") events = await fetchCashoutList(source);
  else throw new Error(`${source.name}: unknown laravelMode "${mode}"`);

  return events.slice(0, Number(source.limit) || 40);
}

// Backward-compatible export used by trevbucks config
export const fetchTrevbucksLivewire = fetchLaravelLiveFeed;
