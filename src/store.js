export const PAGE_SIZE = 50;
export const SOURCE_HISTORY_LIMIT = 400;
export const HISTORY_PAGES = Math.ceil(SOURCE_HISTORY_LIMIT / PAGE_SIZE);
const DEDUPE_WINDOW_MS = Math.max(
  60_000,
  Number(process.env.FEED_DEDUPE_WINDOW_MINUTES || 10) * 60 * 1000
);
/** @type {Map<string, import('./types.js').FeedEvent>} */
const byId = new Map();

/** @type {import('./types.js').FeedEvent[]} */
let ordered = [];

function toTime(event) {
  const time = new Date(event?.at || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortNewestFirst() {
  ordered.sort((a, b) => toTime(b) - toTime(a));
}

function normalizeKeyPart(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericOfferName(value) {
  const text = normalizeKeyPart(value);
  return (
    !text ||
    text === "completed offer" ||
    text === "offer" ||
    text === "reward" ||
    text === "live reward" ||
    text === "featured offer" ||
    text === "recent earner" ||
    text === "pending / no credit yet" ||
    /^\d+(?:\.\d+)?\s+coin reward$/.test(text) ||
    /^[a-z0-9 ._-]+\s+reward$/.test(text)
  );
}

/**
 * Same user + same offer + same amount should not be inserted repeatedly when
 * a source refreshes a ticker with slightly different relative timestamps.
 * @param {import('./types.js').FeedEvent} event
 */
function semanticKey(event) {
  return [
    event.source,
    normalizeKeyPart(event.userId || event.user),
    normalizeKeyPart(event.offerwall),
    normalizeKeyPart(event.offerName || event.offer),
    Number(event.amount || 0).toFixed(4),
    normalizeKeyPart(event.unit || ""),
  ].join("|");
}

/**
 * @param {import('./types.js').FeedEvent} event
 */
function findRecentDuplicate(event) {
  const incomingKey = semanticKey(event);
  const incomingTime = toTime(event) || Date.now();
  return ordered.find((existing) => {
    if (existing.id === event.id) return false;
    if (semanticKey(existing) !== incomingKey) return false;
    const existingTime = toTime(existing) || incomingTime;
    return Math.abs(incomingTime - existingTime) <= DEDUPE_WINDOW_MS;
  });
}

/**
 * @param {import('./types.js').FeedEvent} existing
 * @param {import('./types.js').FeedEvent} incoming
 */
function mergeEvent(existing, incoming) {
  let changed = false;
  if (
    incoming.offerName &&
    (!existing.offerName ||
      (isGenericOfferName(existing.offerName) && !isGenericOfferName(incoming.offerName)))
  ) {
    existing.offerName = incoming.offerName;
    if (incoming.offer) existing.offer = incoming.offer;
    changed = true;
  }
  if (!existing.country && incoming.country) {
    existing.country = incoming.country;
    changed = true;
  }
  if (!existing.userId && incoming.userId) {
    existing.userId = incoming.userId;
    changed = true;
  }
  if (!existing.rawAmount && incoming.rawAmount) {
    existing.rawAmount = incoming.rawAmount;
    changed = true;
  }
  if (incoming.isPrivate && !existing.isPrivate) {
    existing.isPrivate = true;
    changed = true;
  }
  return changed;
}

function trimSourceHistory(sourceId) {
  const sourceEvents = ordered.filter((event) => event.source === sourceId);
  if (sourceEvents.length <= SOURCE_HISTORY_LIMIT) return;
  sourceEvents.sort((a, b) => toTime(b) - toTime(a));
  const keep = new Set(sourceEvents.slice(0, SOURCE_HISTORY_LIMIT).map((event) => event.id));
  const drop = sourceEvents
    .slice(SOURCE_HISTORY_LIMIT)
    .map((event) => event.id);
  for (const id of drop) byId.delete(id);
  ordered = ordered.filter((event) => event.source !== sourceId || keep.has(event.id));
}

/**
 * Backfill offer/country on older PaidCash rows (same user + wall + amount).
 * @param {import('./types.js').FeedEvent} incoming
 * @returns {import('./types.js').FeedEvent[]}
 */
function enrichPaidcashPeer(incoming) {
  /** @type {import('./types.js').FeedEvent[]} */
  const touched = [];
  if (incoming.source !== "paidcash") return touched;
  for (const ev of ordered) {
    if (ev.source !== "paidcash" || ev.user !== incoming.user) continue;
    if (ev.offerwall !== incoming.offerwall || ev.amount !== incoming.amount) continue;
    let changed = false;
    if (!ev.offerName && incoming.offerName) {
      ev.offerName = incoming.offerName;
      ev.offer = incoming.offer;
      changed = true;
    }
    if (!ev.country && incoming.country) {
      ev.country = incoming.country;
      changed = true;
    }
    if (incoming.isPrivate) {
      ev.isPrivate = true;
      changed = true;
    }
    if (changed) touched.push(ev);
  }
  return touched;
}

/**
 * @param {import('./types.js').FeedEvent} event
 */
export function upsertEvent(event) {
  const existing = byId.get(event.id);
  if (existing) {
    return mergeEvent(existing, event);
  }
  const duplicate = findRecentDuplicate(event);
  if (duplicate) {
    mergeEvent(duplicate, event);
    return false;
  }
  byId.set(event.id, event);
  ordered.unshift(event);
  trimSourceHistory(event.source);
  return true;
}

/**
 * @param {import('./types.js').FeedEvent[]} events
 * @returns {import('./types.js').FeedEvent[]}
 */
export function upsertMany(events) {
  /** @type {import('./types.js').FeedEvent[]} */
  const added = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const e of events) {
    for (const t of enrichPaidcashPeer(e)) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        added.push(t);
      }
    }
    if (upsertEvent(e)) {
      const row = byId.get(e.id) ?? e;
      if (!seen.has(row.id)) {
        seen.add(row.id);
        added.push(row);
      }
    }
  }
  return added;
}

export function compactDuplicateEvents() {
  sortNewestFirst();
  const kept = [];
  const seen = new Map();
  let removed = 0;
  for (const event of ordered) {
    const key = semanticKey(event);
    const time = toTime(event) || Date.now();
    const prev = seen.get(key);
    if (prev && Math.abs(time - prev.time) <= DEDUPE_WINDOW_MS) {
      mergeEvent(prev.event, event);
      byId.delete(event.id);
      removed += 1;
      continue;
    }
    seen.set(key, { time, event });
    kept.push(event);
  }
  ordered = kept;
  return removed;
}

/**
 * Remove PaidCash rows whose offer name matches blocked patterns.
 * @param {string[]} patterns
 * @returns {number}
 */
export function removePaidcashBlockedOffers(patterns) {
  if (!patterns?.length) return 0;
  const drop = new Set();
  for (const ev of ordered) {
    if (ev.source !== "paidcash" || !ev.offerName) continue;
    const n = ev.offerName.toLowerCase();
    if (patterns.some((p) => n.includes(String(p).toLowerCase()))) drop.add(ev.id);
  }
  if (!drop.size) return 0;
  for (const id of drop) byId.delete(id);
  ordered = ordered.filter((e) => !drop.has(e.id));
  return drop.size;
}

/**
 * Remove PaidCash history rows that have no offer name (old browser scrape).
 * @returns {number}
 */
export function removePaidcashWithoutOfferName() {
  const drop = new Set();
  for (const ev of ordered) {
    if (ev.source === "paidcash" && !ev.offerName) drop.add(ev.id);
  }
  if (!drop.size) return 0;
  for (const id of drop) byId.delete(id);
  ordered = ordered.filter((e) => !drop.has(e.id));
  return drop.size;
}

/**
 * Remove cached rows for sources that are no longer configured.
 * @param {Set<string>} allowedSourceIds
 * @returns {number}
 */
export function removeEventsOutsideSources(allowedSourceIds) {
  if (!allowedSourceIds?.size) return 0;
  const drop = new Set();
  for (const ev of ordered) {
    if (!allowedSourceIds.has(String(ev.source))) drop.add(ev.id);
  }
  if (!drop.size) return 0;
  for (const id of drop) byId.delete(id);
  ordered = ordered.filter((event) => !drop.has(event.id));
  rebuildDailyFromOrdered();
  return drop.size;
}

/**
 * @param {{ source?: string, limit?: number }} [opts]
 */
export function getEvents(opts = {}) {
  const { source, limit = 100 } = opts;
  return getFilteredList(source).slice(0, limit);
}

/**
 * @param {string | undefined} source
 */
function getFilteredList(source) {
  if (source && source !== "all") {
    return ordered
      .filter((e) => e.source === source)
      .slice()
      .sort((a, b) => toTime(b) - toTime(a))
      .slice(0, SOURCE_HISTORY_LIMIT);
  }
  return ordered.slice().sort((a, b) => toTime(b) - toTime(a));
}

/**
 * @param {{ source?: string, page?: number, pageSize?: number }} [opts]
 */
export function getEventsPaginated(opts = {}) {
  const pageSize = Math.min(
    PAGE_SIZE,
    Math.max(1, Number(opts.pageSize) || PAGE_SIZE)
  );
  const page = Math.max(1, Number(opts.page) || 1);
  const list = getFilteredList(opts.source);
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const events = list.slice(start, start + pageSize);

  return {
    events,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
    },
  };
}

/** @type {string} */
let impressionDay = "";

/** @type {Map<string, Map<string, { offer: string, count: number, maxAmount: number, maxRawAmount: string, unit: string, latestAt: string }>>} */
const dailyOfferCounts = new Map();

function todayKey() {
  return dayKeyForAt(new Date().toISOString());
}

function dayKeyForAt(value) {
  const date = new Date(value || Date.now());
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(Number.isFinite(date.getTime()) ? date : new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function resetDailyIfNeeded() {
  const day = todayKey();
  if (impressionDay === day) return;
  impressionDay = day;
  dailyOfferCounts.clear();
}

function rebuildDailyFromOrdered() {
  resetDailyIfNeeded();
  dailyOfferCounts.clear();
  for (const event of ordered) {
    if (dayKeyForAt(event.at) === impressionDay) {
      recordDailyImpressions(event.source, [event]);
    }
  }
}

/**
 * @param {string} sourceId
 * @param {string[]} offers
 */
export function recordDailyImpressions(sourceId, events) {
  resetDailyIfNeeded();
  if (!dailyOfferCounts.has(sourceId)) {
    dailyOfferCounts.set(sourceId, new Map());
  }
  const bucket = dailyOfferCounts.get(sourceId);
  for (const ev of events) {
    const label =
      typeof ev === "string"
        ? ev
        : ev.offerName
          ? `${ev.offerwall || ""} → ${ev.offerName}`.replace(/^ → /, "")
          : ev.offer || ev.offerwall || "";
    const key = label.toLowerCase().trim();
    if (!key) continue;
    const amount = typeof ev === "object" && ev != null ? Number(ev.amount) || 0 : 0;
    const unit = typeof ev === "object" && ev?.unit ? String(ev.unit) : "coins";
    const rawAmount =
      typeof ev === "object" && ev?.rawAmount
        ? String(ev.rawAmount)
        : amount > 0
          ? `${amount} ${unit}`
          : "";
    const at = typeof ev === "object" && ev?.at ? String(ev.at) : new Date().toISOString();
    const row = bucket.get(key);
    if (row) {
      row.count += 1;
      if (new Date(at).getTime() > new Date(row.latestAt || 0).getTime()) {
        row.latestAt = at;
      }
      if (amount > row.maxAmount) {
        row.maxAmount = amount;
        row.maxRawAmount = rawAmount || row.maxRawAmount;
        row.unit = unit;
      }
    } else {
      bucket.set(key, {
        offer: label,
        count: 1,
        maxAmount: amount,
        maxRawAmount: rawAmount,
        unit,
        latestAt: at,
      });
    }
  }
}

/**
 * @param {{ source?: string, limit?: number }} [opts]
 */
export function getDailyTopOffers(opts = {}) {
  resetDailyIfNeeded();
  const limit = Math.min(15, Math.max(1, Number(opts.limit) || 8));
  const filterSource = opts.source && opts.source !== "all" ? opts.source : null;

  /** @type {Record<string, { source: string, byFrequency: { offer: string, count: number, maxAmount: number, maxRawAmount: string, latestAt: string, rank: number }[], byCoins: { offer: string, count: number, maxAmount: number, maxRawAmount: string, latestAt: string, rank: number }[] }>} */
  const bySource = {};

  for (const [sourceId, bucket] of dailyOfferCounts) {
    if (filterSource && sourceId !== filterSource) continue;
    const rows = [...bucket.values()];
    const mapRow = (row, rank) => ({
      offer: row.offer,
      count: row.count,
      maxAmount: row.maxAmount,
      maxRawAmount: row.maxRawAmount || `${row.maxAmount} ${row.unit}`,
      latestAt: row.latestAt,
      rank,
    });
    const byFrequency = rows
      .sort((a, b) => b.count - a.count || b.maxAmount - a.maxAmount)
      .slice(0, limit)
      .map((row, i) => mapRow(row, i + 1));
    const byCoins = rows
      .filter((row) => row.maxAmount > 0)
      .sort((a, b) => b.maxAmount - a.maxAmount || b.count - a.count)
      .slice(0, limit)
      .map((row, i) => mapRow(row, i + 1));
    if (byFrequency.length || byCoins.length) {
      bySource[sourceId] = { source: sourceId, byFrequency, byCoins };
    }
  }

  return {
    day: impressionDay || todayKey(),
    bySource,
  };
}

/**
 * Build top offers from a moving time window, used for true hourly reports.
 * @param {{ source?: string, limit?: number, windowMs?: number }} [opts]
 */
export function getRecentTopOffers(opts = {}) {
  const limit = Math.min(15, Math.max(1, Number(opts.limit) || 8));
  const windowMs = Math.max(60_000, Number(opts.windowMs) || 60 * 60 * 1000);
  const cutoff = Date.now() - windowMs;
  const filterSource = opts.source && opts.source !== "all" ? opts.source : null;
  const buckets = new Map();

  for (const event of ordered) {
    const time = toTime(event);
    if (!time || time < cutoff) continue;
    if (filterSource && event.source !== filterSource) continue;
    const sourceId = event.source;
    if (!buckets.has(sourceId)) buckets.set(sourceId, new Map());
    const bucket = buckets.get(sourceId);
    const label = event.offerName
      ? `${event.offerwall || ""} → ${event.offerName}`.replace(/^ → /, "")
      : event.offer || event.offerwall || "";
    const key = label.toLowerCase().trim();
    if (!key) continue;
    const amount = Number(event.amount) || 0;
    const unit = event.unit ? String(event.unit) : "coins";
    const rawAmount = event.rawAmount || (amount > 0 ? `${amount} ${unit}` : "");
    const row = bucket.get(key);
    if (row) {
      row.count += 1;
      if (time > new Date(row.latestAt || 0).getTime()) row.latestAt = event.at;
      if (amount > row.maxAmount) {
        row.maxAmount = amount;
        row.maxRawAmount = rawAmount || row.maxRawAmount;
        row.unit = unit;
      }
    } else {
      bucket.set(key, {
        offer: label,
        count: 1,
        maxAmount: amount,
        maxRawAmount: rawAmount,
        unit,
        latestAt: event.at,
      });
    }
  }

  const bySource = {};
  for (const [sourceId, bucket] of buckets) {
    const rows = [...bucket.values()];
    const mapRow = (row, rank) => ({
      offer: row.offer,
      count: row.count,
      maxAmount: row.maxAmount,
      maxRawAmount: row.maxRawAmount || `${row.maxAmount} ${row.unit}`,
      latestAt: row.latestAt,
      rank,
    });
    const byFrequency = rows
      .slice()
      .sort((a, b) => b.count - a.count || b.maxAmount - a.maxAmount)
      .slice(0, limit)
      .map((row, i) => mapRow(row, i + 1));
    const byCoins = rows
      .filter((row) => row.maxAmount > 0)
      .sort((a, b) => b.maxAmount - a.maxAmount || b.count - a.count)
      .slice(0, limit)
      .map((row, i) => mapRow(row, i + 1));
    if (byFrequency.length || byCoins.length) {
      bySource[sourceId] = { source: sourceId, byFrequency, byCoins };
    }
  }

  return {
    day: `${Math.round(windowMs / 60000)}m window`,
    bySource,
  };
}

export function getStats() {
  const sources = {};
  for (const e of ordered) {
    sources[e.source] = (sources[e.source] || 0) + 1;
  }
  return {
    total: ordered.length,
    sources,
    lastUpdated: ordered[0]?.at ?? null,
  };
}

/** @type {Set<import('http').ServerResponse>} */
const sseClients = new Set();

export function addSseClient(res) {
  sseClients.add(res);
  return () => sseClients.delete(res);
}

/**
 * @param {import('./types.js').FeedEvent[]} newEvents
 */
export function broadcastNew(newEvents) {
  if (!newEvents.length || sseClients.size === 0) return;
  const payload = JSON.stringify({ type: "events", data: newEvents });
  for (const client of sseClients) {
    client.write(`data: ${payload}\n\n`);
  }
}

/**
 * Restore in-memory feed + daily top offers from disk/blob.
 * @param {Record<string, unknown> | null | undefined} state
 */
export function hydrateStoreState(state) {
  if (!state || typeof state !== "object") return;
  byId.clear();
  ordered = [];

  const events = Array.isArray(state.events) ? state.events : [];
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!ev?.id) continue;
    byId.set(ev.id, ev);
    ordered.unshift(ev);
  }
  sortNewestFirst();
  compactDuplicateEvents();
  const sourceIds = new Set(ordered.map((event) => event.source));
  for (const sourceId of sourceIds) trimSourceHistory(sourceId);
  sortNewestFirst();

  impressionDay = typeof state.impressionDay === "string" ? state.impressionDay : "";
  dailyOfferCounts.clear();
  const rawDaily = state.dailyOfferCounts;
  if (rawDaily && typeof rawDaily === "object") {
    for (const [sourceId, bucketRaw] of Object.entries(rawDaily)) {
      /** @type {Map<string, { offer: string, count: number, maxAmount: number, maxRawAmount: string, unit: string, latestAt: string }>} */
      const bucket = new Map();
      if (Array.isArray(bucketRaw)) {
        for (const entry of bucketRaw) {
          if (!Array.isArray(entry) || entry.length < 2) continue;
          const [key, row] = entry;
          if (!key || !row || typeof row !== "object") continue;
          bucket.set(String(key), {
            offer: String(row.offer || key),
            count: Number(row.count) || 0,
            maxAmount: Number(row.maxAmount) || 0,
            maxRawAmount: String(row.maxRawAmount || ""),
            unit: String(row.unit || "coins"),
            latestAt: String(row.latestAt || state.savedAt || new Date().toISOString()),
          });
        }
      }
      if (bucket.size) dailyOfferCounts.set(sourceId, bucket);
    }
  }
  resetDailyIfNeeded();
  dailyOfferCounts.clear();
  for (const event of ordered) {
    if (dayKeyForAt(event.at) === impressionDay) {
      recordDailyImpressions(event.source, [event]);
    }
  }
}

export function exportStoreState() {
  /** @type {Record<string, [string, { offer: string, count: number, maxAmount: number, maxRawAmount: string, unit: string, latestAt: string }][]>} */
  const dailyOfferCountsOut = {};
  for (const [sourceId, bucket] of dailyOfferCounts) {
    dailyOfferCountsOut[sourceId] = [...bucket.entries()];
  }
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    events: ordered.slice().sort((a, b) => toTime(b) - toTime(a)),
    sourceHistoryLimit: SOURCE_HISTORY_LIMIT,
    impressionDay: impressionDay || todayKey(),
    dailyOfferCounts: dailyOfferCountsOut,
  };
}
