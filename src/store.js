export const PAGE_SIZE = 30;
export const HISTORY_PAGES = 30;
const MAX_EVENTS = 5000;
/** @type {Map<string, import('./types.js').FeedEvent>} */
const byId = new Map();

/** @type {import('./types.js').FeedEvent[]} */
let ordered = [];

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
    let changed = false;
    if (!existing.offerName && event.offerName) {
      existing.offerName = event.offerName;
      existing.offer = event.offer;
      changed = true;
    }
    if (!existing.country && event.country) {
      existing.country = event.country;
      changed = true;
    }
    return changed;
  }
  byId.set(event.id, event);
  ordered.unshift(event);
  if (ordered.length > MAX_EVENTS) {
    const removed = ordered.pop();
    if (removed) byId.delete(removed.id);
  }
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
    return ordered.filter((e) => e.source === source);
  }
  return ordered;
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
  const totalPages = Math.min(
    HISTORY_PAGES,
    Math.max(1, Math.ceil(total / pageSize) || 1)
  );
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

/** @type {Map<string, Map<string, { offer: string, count: number }>>} */
const dailyOfferCounts = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function resetDailyIfNeeded() {
  const day = todayKey();
  if (impressionDay === day) return;
  impressionDay = day;
  dailyOfferCounts.clear();
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
    const row = bucket.get(key);
    if (row) {
      row.count += 1;
    } else {
      bucket.set(key, { offer: label, count: 1 });
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

  /** @type {Record<string, { source: string, offers: { offer: string, count: number, rank: number }[] }>} */
  const bySource = {};

  for (const [sourceId, bucket] of dailyOfferCounts) {
    if (filterSource && sourceId !== filterSource) continue;
    const sorted = [...bucket.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((row, i) => ({
        offer: row.offer,
        count: row.count,
        rank: i + 1,
      }));
    if (sorted.length) {
      bySource[sourceId] = { source: sourceId, offers: sorted };
    }
  }

  return {
    day: impressionDay || todayKey(),
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

export function exportStoreState() {
  const daily = {};
  for (const [sourceId, bucket] of dailyOfferCounts) {
    daily[sourceId] = [...bucket.entries()];
  }
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    events: ordered,
    impressionDay,
    dailyOfferCounts: daily,
  };
}

export function hydrateStoreState(state) {
  if (!state || !Array.isArray(state.events)) return;
  byId.clear();
  ordered = [];
  for (const event of state.events.slice(0, MAX_EVENTS)) {
    if (!event?.id) continue;
    byId.set(event.id, event);
    ordered.push(event);
  }
  impressionDay = typeof state.impressionDay === "string" ? state.impressionDay : "";
  dailyOfferCounts.clear();
  if (state.dailyOfferCounts && typeof state.dailyOfferCounts === "object") {
    for (const [sourceId, entries] of Object.entries(state.dailyOfferCounts)) {
      if (Array.isArray(entries)) dailyOfferCounts.set(sourceId, new Map(entries));
    }
  }
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
