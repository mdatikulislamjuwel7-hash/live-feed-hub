import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { fetchSource } from "./adapters/index.js";
import {
  upsertMany,
  broadcastNew,
  getStats,
  recordDailyImpressions,
  removePaidcashWithoutOfferName,
  removePaidcashBlockedOffers,
  exportStoreState,
  hydrateStoreState,
} from "./store.js";
import { readPersistedState, writePersistedState } from "./persistence.js";
import { notifyTelegram, telegramStatus } from "./telegram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "..", "config", "sources.json");

/** @type {Record<string, unknown>[]} */
let sources = JSON.parse(readFileSync(configPath, "utf8"));

/** @type {Record<string, { status: string, lastOk: string | null, lastError: string | null, count: number }>} */
export const sourceHealth = {};

/** @type {Map<string, NodeJS.Timeout>} */
const timers = new Map();

let persistTimer = null;

export async function loadPersistedStore() {
  const state = await readPersistedState();
  if (state) {
    hydrateStoreState(state);
    console.log(`[persistence] loaded ${getStats().total} stored events`);
  }
}

export async function savePersistedStore() {
  await writePersistedState(exportStoreState());
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    savePersistedStore().catch((err) =>
      console.warn(`[persistence] save failed: ${err instanceof Error ? err.message : String(err)}`)
    );
  }, 900);
}

/**
 * @param {Record<string, unknown>} source
 */
async function pollOne(source) {
  const id = /** @type {string} */ (source.id);
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
    recordDailyImpressions(id, added);
    if (added.length > 0) broadcastNew(added);
    if (added.length > 0) {
      notifyTelegram(added).catch((err) =>
        console.warn(`[telegram] ${err instanceof Error ? err.message : String(err)}`)
      );
    }
    if (added.length > 0 || events.length > 0) schedulePersist();
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
    console.log(`[${id}] ${events.length} items, ${added.length} new`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sourceHealth[id] = {
      status: "error",
      lastOk: sourceHealth[id]?.lastOk ?? null,
      lastError: message,
      count: 0,
    };
    console.warn(`[${id}] ${message}`);
  }
}

export async function runInitialFetch() {
  const enabled = sources.filter((s) => s.enabled);
  await Promise.allSettled(enabled.map((s) => pollOne(s)));
}

function sourcePollRank(source) {
  const type = String(source.type || "");
  if (type === "ticker-api") return 0;
  if (type === "gamersuniverse-html") return 1;
  if (type === "paidcash-browser") return 2;
  return 3;
}

function isFastStartupSource(source) {
  const type = String(source.type || "");
  return type !== "html-livewire" && type !== "paidcash-browser";
}

export function startPolling() {
  console.log(`[telegram] ${telegramStatus()}`);
  const enabled = sources
    .filter((s) => s.enabled)
    .sort((a, b) => sourcePollRank(a) - sourcePollRank(b));

  for (const source of enabled) {
    const id = /** @type {string} */ (source.id);
    const seconds = Number(source.pollSeconds) || 20;

    pollOne(source);
    if (isFastStartupSource(source)) {
      setTimeout(() => pollOne(source), 7000);
    }
    if (timers.has(id)) clearInterval(timers.get(id));
    timers.set(
      id,
      setInterval(() => pollOne(source), seconds * 1000)
    );
  }
}

export function getSources() {
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    enabled: s.enabled,
    color: s.color,
    type: s.type,
    health: sourceHealth[/** @type {string} */ (s.id)] ?? {
      status: "pending",
      lastOk: null,
      lastError: null,
      count: 0,
      note: null,
    },
  }));
}

export function reloadConfig() {
  sources = JSON.parse(readFileSync(configPath, "utf8"));
}

export { getStats };
