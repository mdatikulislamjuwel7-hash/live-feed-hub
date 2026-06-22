import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { fetchSource } from "./adapters/index.js";
import { writePersistedState } from "./persistence.js";
import { notifySourceHealthChange, notifyTelegram } from "./telegram.js";
import {
  upsertMany,
  broadcastNew,
  getStats,
  exportStoreState,
  recordDailyImpressions,
  removePaidcashWithoutOfferName,
  removePaidcashBlockedOffers,
} from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "..", "config", "sources.json");

/** @type {Record<string, unknown>[]} */
let sources = JSON.parse(readFileSync(configPath, "utf8"));

/** @type {Record<string, { status: string, lastOk: string | null, lastError: string | null, count: number }>} */
export const sourceHealth = {};

/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map();

/** @type {Set<string>} */
const alertPrimedSources = new Set();

/** @type {ReturnType<typeof setTimeout> | null} */
let persistTimer = null;

const initialAlertLimit = Math.max(0, Number(process.env.TELEGRAM_INITIAL_ALERT_LIMIT || 5));
const initialAlertMaxAgeMs = Math.max(
  60_000,
  Number(process.env.TELEGRAM_INITIAL_ALERT_MAX_AGE_MINUTES || 10) * 60 * 1000
);

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writePersistedState(exportStoreState()).catch((err) => {
      console.warn(
        `[persist] save failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }, 1500);
}

/**
 * Let a few genuinely fresh rows through after redeploy while still avoiding
 * massive old-feed floods from first source polls.
 * @param {import('./types.js').FeedEvent[]} events
 */
function initialAlertCandidates(events) {
  if (!initialAlertLimit) return [];
  const cutoff = Date.now() - initialAlertMaxAgeMs;
  return events
    .filter((event) => {
      const time = new Date(event.at || 0).getTime();
      return Number.isFinite(time) && time >= cutoff;
    })
    .slice(0, initialAlertLimit);
}

/**
 * @param {Record<string, unknown>} source
 */
async function pollOne(source) {
  const id = /** @type {string} */ (source.id);
  const previousHealth = sourceHealth[id];
  try {
    const events = await fetchSource(source);
    if (id === "paidcash") {
      const blockPatterns = Array.isArray(source.blockOfferPatterns)
        ? source.blockOfferPatterns.map((p) => String(p))
        : ["MM Quiz", "Watch More"];
      const blocked = removePaidcashBlockedOffers(blockPatterns);
      if (blocked > 0) {
        console.log(`[paidcash] removed ${blocked} blocked offer rows`);
      }
      if (events.some((e) => e.offerName)) {
        const removed = removePaidcashWithoutOfferName();
        if (removed > 0) {
          console.log(`[paidcash] removed ${removed} stale rows without offer name`);
        }
      }
    }
    const added = upsertMany(events);
    const alertReady = alertPrimedSources.has(id);
    if (added.length > 0) {
      recordDailyImpressions(id, added);
      broadcastNew(added);
      if (alertReady) {
        notifyTelegram(added).catch((err) => {
          console.warn(`[telegram] ${err instanceof Error ? err.message : String(err)}`);
        });
      } else {
        const fresh = initialAlertCandidates(added);
        if (fresh.length > 0) {
          notifyTelegram(fresh).catch((err) => {
            console.warn(`[telegram] ${err instanceof Error ? err.message : String(err)}`);
          });
        }
        console.log(`[${id}] sent ${fresh.length}, skipped ${added.length - fresh.length} initial Telegram alerts`);
      }
    }
    /** @type {string | null} */
    let note = null;
    if (
      id === "gamersuniverse" &&
      events.length > 0 &&
      events.every(
        (e) => e.offerwall === "Cash Out" || e.offerName === "Withdrawal"
      )
    ) {
      note =
        "শুধু পাবলিক payouts — Live Completions (Offery) এর জন্য config/gamersuniverse.cookie";
    }
    sourceHealth[id] = {
      status: "ok",
      lastOk: new Date().toISOString(),
      lastError: null,
      count: events.length,
      note,
    };
    notifySourceHealthChange(source, sourceHealth[id], previousHealth).catch((err) => {
      console.warn(`[telegram] ${err instanceof Error ? err.message : String(err)}`);
    });
    alertPrimedSources.add(id);
    console.log(`[${id}] ${events.length} items, ${added.length} new`);
    schedulePersist();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sourceHealth[id] = {
      status: "error",
      lastOk: sourceHealth[id]?.lastOk ?? null,
      lastError: message,
      count: 0,
    };
    notifySourceHealthChange(source, sourceHealth[id], previousHealth).catch((err) => {
      console.warn(`[telegram] ${err instanceof Error ? err.message : String(err)}`);
    });
    console.warn(`[${id}] ${message}`);
  }
}

export async function runInitialFetch() {
  const enabled = sources.filter((s) => s.enabled);
  await Promise.allSettled(enabled.map((s) => pollOne(s)));
}

function sourcePollRank(source) {
  const type = String(source.type || "");
  if (
    type === "ticker-api" ||
    type === "json-feed" ||
    type === "graphql-feed" ||
    type === "paidbyte-public" ||
    type === "earnfino-leaderboard" ||
    type === "public-live-feed" ||
    type === "apucash-inertia"
  ) {
    return 0;
  }
  if (
    type === "gamersuniverse-html" ||
    type === "laravel-live-feed" ||
    type === "zxearn-html" ||
    type === "cashlyearn-public" ||
    type === "live-table" ||
    type === "swiper-csm-feed" ||
    type === "ticker-cards-html" ||
    type === "covencash-pusher"
  ) {
    return 1;
  }
  if (type === "paidcash-browser" || type === "trevbucks-livewire") return 2;
  if (type === "splitdrop-public" || type === "revno-dashboard") return 3;
  if (type === "html-livewire") return 4;
  return 3;
}

export function startPolling() {
  const enabled = sources
    .filter((s) => s.enabled)
    .sort((a, b) => sourcePollRank(a) - sourcePollRank(b));

  for (const source of enabled) {
    const id = /** @type {string} */ (source.id);
    const seconds = Number(source.pollSeconds) || 20;

    pollOne(source);
    if (timers.has(id)) clearInterval(timers.get(id));
    timers.set(
      id,
      setInterval(() => pollOne(source), seconds * 1000)
    );
  }
}

export function getSources() {
  const cached = getStats().sources;
  return sources.map((s) => {
    const id = /** @type {string} */ (s.id);
    const live = sourceHealth[id];
    const stored = cached[id] || 0;
    if (live) {
      return {
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        color: s.color,
        type: s.type,
        health: {
          ...live,
          count: live.status === "ok" ? live.count : Math.max(live.count, stored),
        },
      };
    }
    return {
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      color: s.color,
      type: s.type,
      health: {
        status: stored > 0 ? "ok" : "syncing",
        lastOk: null,
        lastError: null,
        count: stored,
        note: stored > 0 ? "Refreshing…" : null,
      },
    };
  });
}

export function reloadConfig() {
  sources = JSON.parse(readFileSync(configPath, "utf8"));
}

export { getStats };
