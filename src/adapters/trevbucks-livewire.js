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
  const unit = match[2];
  const multipliers = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };
  return new Date(now - amount * multipliers[unit]).toISOString();
}

async function fetchHome(source) {
  const url = String(source.url || "https://trevbucks.com/");
  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  return {
    html: await res.text(),
    cookie: (res.headers.getSetCookie?.() || []).map((item) => item.split(";")[0]).join("; "),
  };
}

async function fetchLiveCashoutHtml(source) {
  const { html, cookie } = await fetchHome(source);
  const $ = cheerio.load(html);
  const csrf = $('meta[name="csrf-token"]').attr("content") || "";
  const component = $("[wire\\:snapshot]")
    .toArray()
    .map((el) => ({
      snapshot: $(el).attr("wire:snapshot") || "",
      intersect: $(el).attr("x-intersect") || "",
    }))
    .find((item) => item.snapshot.includes("user.live-cashouts"));

  if (!component) throw new Error(`${source.name}: live cashouts component not found`);

  const snapshot = decodeAttr(component.snapshot);
  const lazyPayload = decodeAttr(component.intersect).match(/__lazyLoad\('([^']+)/)?.[1];
  if (!lazyPayload) throw new Error(`${source.name}: live cashouts lazy payload not found`);

  const xsrf = cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
  const token = xsrf ? decodeURIComponent(xsrf) : csrf;
  const res = await fetch(new URL("/livewire/update", String(source.url || "https://trevbucks.com/")).toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrf,
      "X-XSRF-TOKEN": token,
      "X-Livewire": "",
      Cookie: cookie,
      Origin: "https://trevbucks.com",
      Referer: "https://trevbucks.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
    },
    body: JSON.stringify({
      _token: csrf,
      components: [
        {
          snapshot,
          updates: {},
          calls: [{ path: "", method: "__lazyLoad", params: [lazyPayload] }],
        },
      ],
    }),
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });

  if (!res.ok) throw new Error(`${source.name}: Livewire HTTP ${res.status}`);
  const json = await res.json();
  return json?.components?.[0]?.effects?.html || "";
}

function parseTitle(title) {
  const $ = cheerio.load(title || "");
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const username = text.match(/Username:\s*(.*?)\s+Amount:/i)?.[1] || "";
  const amountText = text.match(/Amount:\s*(.*?)$/i)?.[1] || "";
  return { username, amount: asNumber(amountText), rawAmount: amountText };
}

function splitOffer(offer) {
  const cleaned = String(offer || "Live reward").replace(/\s*\(\d+\)\s*$/g, "").trim();
  const parts = cleaned.split(/\s+-\s+/);
  if (parts.length < 2) return { offerwall: cleaned || "Live reward", offerName: "Live reward" };
  return { offerwall: parts.shift() || "Offer", offerName: parts.join(" - ") || "Live reward" };
}

function parseLiveCashouts(html, source) {
  const $ = cheerio.load(html);
  return $(".swiper-slide")
    .toArray()
    .map((el) => {
      const $el = $(el);
      const { username, amount, rawAmount } = parseTitle($el.attr("title") || "");
      const text = $el.text().replace(/\s+/g, " ").trim();
      const timeText = text.match(/(?:just now|\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)/i)?.[0] || "";
      const user = username || text.replace(timeText, "").trim() || "anonymous";
      const userId = $el.find("[\\@click]").attr("@click")?.match(/user_id:\s*'([^']+)/)?.[1] || "";
      const offerAlt =
        $el
          .find("img")
          .toArray()
          .map((img) => $(img).attr("alt") || "")
          .find((alt) => alt.trim()) || "Live reward";
      const { offerwall, offerName } = splitOffer(offerAlt);
      const id = hashId(String(source.id), [userId || user, offerwall, offerName, amount]);

      return {
        id: `${source.id}-${id}`,
        source: String(source.id),
        sourceName: String(source.name),
        user: user.length > 22 ? `${user.slice(0, 22)}...` : user,
        userId,
        offer: truncate(`${offerwall} -> ${offerName}`),
        offerwall,
        offerName: truncate(offerName),
        country: null,
        isPrivate: false,
        amount,
        unit: "points",
        rawAmount: rawAmount || `${amount.toLocaleString()} points`,
        at: relativeToIso(timeText),
      };
    });
}

/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchTrevbucksLivewire(source) {
  const html = await fetchLiveCashoutHtml(source);
  return parseLiveCashouts(html, source).slice(0, Number(source.limit) || 30);
}
