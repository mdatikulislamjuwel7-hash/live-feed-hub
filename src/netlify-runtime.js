import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { fetchNetlifySource, isNetlifySupportedSource, normalizeNetlifySource } from "./netlify-fetch-source.js";
import { readPersistedState, writePersistedState } from "./persistence.js";
import {
  exportStoreState,
  getDailyTopOffers,
  getEvents,
  getEventsPaginated,
  getStats,
  hydrateStoreState,
  PAGE_SIZE,
  HISTORY_PAGES,
  recordDailyImpressions,
  upsertMany,
} from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "..", "config", "sources.json");

let loaded = false;
let lastRefreshAt = 0;
let health = {};

function readSources() {
  return JSON.parse(readFileSync(configPath, "utf8"));
}

function healthRow(source, override = null) {
  return {
    id: source.id,
    name: source.name,
    enabled: source.enabled,
    color: source.color,
    type: source.type,
    health: override ||
      health[source.id] || {
        status: isNetlifySupportedSource(source) ? "pending" : "skipped",
        lastOk: null,
        lastError: isNetlifySupportedSource(source) ? null : "Not enabled for Netlify Functions",
        count: 0,
        note: null,
      },
  };
}

async function loadOnce() {
  if (loaded) return;
  hydrateStoreState(await readPersistedState());
  loaded = true;
}

export async function refreshNetlifyData({ force = false } = {}) {
  await loadOnce();
  const now = Date.now();
  const defaultRefreshSeconds = process.env.VERCEL ? 12 : 45;
  const minMs = Number(process.env.REFRESH_MIN_SECONDS || defaultRefreshSeconds) * 1000;
  if (!force && now - lastRefreshAt < minMs) return;
  lastRefreshAt = now;

  const sources = readSources().filter(isNetlifySupportedSource).map(normalizeNetlifySource);
  await Promise.allSettled(
    sources.map(async (source) => {
      const id = String(source.id);
      try {
        const events = await fetchNetlifySource(source);
        recordDailyImpressions(id, events);
        upsertMany(events);
        health[id] = {
          status: "ok",
          lastOk: new Date().toISOString(),
          lastError: null,
          count: events.length,
          note: null,
        };
      } catch (err) {
        health[id] = {
          status: "error",
          lastOk: health[id]?.lastOk ?? null,
          lastError: err instanceof Error ? err.message : String(err),
          count: 0,
          note: null,
        };
      }
    })
  );

  await writePersistedState(exportStoreState());
}

export function netlifySources() {
  return readSources().map((source) => healthRow(source));
}

export function netlifyFeed(query) {
  const source = String(query.get("source") || "all");
  if (query.has("page")) {
    const { events, pagination } = getEventsPaginated({
      source,
      page: Number(query.get("page")),
      pageSize: Number(query.get("pageSize")) || PAGE_SIZE,
    });
    return {
      events,
      pagination,
      stats: getStats(),
      sources: netlifySources(),
      config: { pageSize: PAGE_SIZE, historyPages: HISTORY_PAGES },
    };
  }
  const limit = Math.min(200, Math.max(1, Number(query.get("limit")) || 90));
  return {
    events: getEvents({ source, limit }),
    stats: getStats(),
    sources: netlifySources(),
    config: { pageSize: PAGE_SIZE, historyPages: HISTORY_PAGES },
  };
}

export function netlifyTopOffers(query) {
  return getDailyTopOffers({
    source: String(query.get("source") || "all"),
    limit: Number(query.get("limit")) || 8,
  });
}

export function netlifyStats() {
  return { sources: netlifySources(), stats: getStats() };
}
