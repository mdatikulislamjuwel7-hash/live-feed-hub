const token = process.env.TELEGRAM_BOT_TOKEN || "";
const chatId = process.env.TELEGRAM_CHAT_ID || "";
const allowedChatIds = new Set(
  String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || chatId || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
const sourceFilter = new Set(
  String(process.env.TELEGRAM_SOURCES || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
const commandsEnabled = process.env.TELEGRAM_BOT_COMMANDS !== "false";
const autoTopPinEnabled = process.env.TELEGRAM_AUTO_TOP_PIN !== "false";
const dailyTopPinEnabled = process.env.TELEGRAM_DAILY_TOP_PIN !== "false";
const dailyTopPinTime = String(process.env.TELEGRAM_DAILY_TOP_PIN_TIME || "00:00");
const topCoinsPinLimit = Math.min(
  40,
  Math.max(5, Number(process.env.TELEGRAM_TOPCOINS_PIN_LIMIT || 30))
);
const highCoinAmount = Number(process.env.TELEGRAM_HIGH_COIN_AMOUNT || 1000);
const highUsdAmount = Number(process.env.TELEGRAM_HIGH_USD_AMOUNT || 10);
const divider = "━━━━━━━━━━━━━━━━";
const alertSendDelayMs = Math.max(500, Number(process.env.TELEGRAM_ALERT_DELAY_MS || 1500));
const alertDedupeMs = Math.max(1, Number(process.env.TELEGRAM_ALERT_DEDUPE_HOURS || 24)) * 60 * 60 * 1000;
const minCoinAlertAmount = Math.max(0, Number(process.env.TELEGRAM_MIN_COIN_AMOUNT || 200));
const blockedOfferPatterns = String(
  process.env.TELEGRAM_BLOCK_OFFER_PATTERNS ||
    "survey,mail verify,mail verification,email verify,email verification,binance"
)
  .split(",")
  .map((pattern) => pattern.trim().toLowerCase())
  .filter(Boolean);

let updateOffset = 0;
let botStarted = false;
let autoTopPinStarted = false;
let dailyTopPinStarted = false;
let alertQueueRunning = false;

/** @type {{ text: string, targetChatId: string }[]} */
const alertQueue = [];

/** @type {Map<string, number>} */
const sentAlertIds = new Map();

function enabled() {
  return Boolean(token && chatId);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function amount(event) {
  if (event.rawAmount) return event.rawAmount;
  if (event.unit === "USD") return `$${Number(event.amount || 0).toFixed(2)}`;
  return `${event.amount} ${event.unit || "points"}`;
}

function field(label, value, icon = "") {
  return `${icon ? `${icon} ` : ""}<b>${label}</b> ${escapeHtml(value || "-")}`;
}

function formatEventTime(event) {
  const time = new Date(event?.at || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return "unknown";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  const relative =
    seconds < 60
      ? `${seconds}s ago`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)}m ago`
        : seconds < 86400
          ? `${Math.floor(seconds / 3600)}h ago`
          : `${Math.floor(seconds / 86400)}d ago`;
  return `${relative} (${new Date(time).toLocaleString("en-US", { timeZone: "Asia/Dhaka" })} BDT)`;
}

function formatLeadTime(at) {
  return at ? formatEventTime({ at }) : "unknown";
}

function isAllowedChat(id) {
  return !allowedChatIds.size || allowedChatIds.has(String(id));
}

function hasBlockedOfferText(value) {
  const text = String(value || "").toLowerCase();
  return Boolean(text && blockedOfferPatterns.some((pattern) => text.includes(pattern)));
}

function isCoinLikeUnit(unit) {
  const value = String(unit || "").toUpperCase();
  return value !== "USD";
}

function passesTelegramContentFilter(event) {
  const searchable = [event.offerName, event.offer, event.offerwall].filter(Boolean).join(" ");
  if (hasBlockedOfferText(searchable)) return false;
  if (isCoinLikeUnit(event.unit) && Number(event.amount || 0) < minCoinAlertAmount) return false;
  return true;
}

function passesTelegramOfferFilter(offer) {
  if (hasBlockedOfferText(offer?.offer)) return false;
  const raw = String(offer?.maxRawAmount || "");
  const isUsd = raw.includes("$") || String(offer?.unit || "").toUpperCase() === "USD";
  if (!isUsd && Number(offer?.maxAmount || 0) < minCoinAlertAmount) return false;
  return true;
}

function shouldAlert(event) {
  if (sourceFilter.size && !sourceFilter.has(String(event.source))) return false;
  return passesTelegramContentFilter(event);
}

function pruneSentAlertIds() {
  const cutoff = Date.now() - alertDedupeMs;
  for (const [id, at] of sentAlertIds) {
    if (at < cutoff) sentAlertIds.delete(id);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queueTelegramAlert(text, targetChatId = chatId) {
  if (!token || !targetChatId) return;
  alertQueue.push({ text, targetChatId });
  if (alertQueueRunning) return;
  alertQueueRunning = true;
  (async () => {
    while (alertQueue.length) {
      const item = alertQueue.shift();
      if (!item) continue;
      try {
        await sendTelegramMessage(item.text, item.targetChatId);
      } catch (err) {
        console.warn(`[telegram] ${err instanceof Error ? err.message : String(err)}`);
      }
      if (alertQueue.length) await sleep(alertSendDelayMs);
    }
    alertQueueRunning = false;
  })();
}

function isHighValue(event) {
  const value = Number(event.amount || 0);
  const unit = String(event.unit || "").toUpperCase();
  if (unit === "USD") return value >= highUsdAmount;
  return value >= highCoinAmount;
}

function eventLine(event) {
  const name = event.offerName || event.offer || "Offer";
  const wall = event.offerwall || event.sourceName || "Source";
  const user = event.user ? `@${event.user}` : "unknown user";
  return [
    divider,
    field("Website:", event.sourceName || event.source, "🌐"),
    field("Offer:", name, "🎯"),
    field("Network:", wall, "🧱"),
    field("Reward:", amount(event), "💰"),
    field("User:", user, "👤"),
    field("Completed:", formatEventTime(event), "⏰"),
    divider,
  ].join("\n");
}

function cleanHealthError(message) {
  const text = String(message || "Unknown error");
  if (text.includes("Could not find Chrome")) {
    return "Browser fallback is unavailable on Railway. PaidCash socket/API will retry automatically.";
  }
  if (text.length <= 260) return text;
  return `${text.slice(0, 257)}...`;
}

export async function sendTelegramMessage(text, targetChatId = chatId, extra = {}) {
  if (!token || !targetChatId) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 180)}`);
  }
  const json = await res.json().catch(() => null);
  return json?.result || null;
}

async function pinTelegramMessage(messageId, targetChatId = chatId) {
  if (!token || !targetChatId || !messageId) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/pinChatMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      message_id: messageId,
      disable_notification: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram pin HTTP ${res.status}: ${body.slice(0, 180)}`);
  }
}

/**
 * @param {import('./types.js').FeedEvent[]} events
 */
export async function notifyTelegram(events) {
  if (!enabled() || !events.length) return;
  pruneSentAlertIds();
  const filtered = events.filter(shouldAlert);
  if (!filtered.length) return;
  for (const event of filtered) {
    const eventId = String(event.id || "");
    if (eventId && sentAlertIds.has(eventId)) continue;
    if (eventId) sentAlertIds.set(eventId, Date.now());
    const title = isHighValue(event) ? "🔥 HIGH VALUE LIVE LEAD" : "🚀 NEW LIVE LEAD";
    queueTelegramAlert(`<b>${title}</b>\n${eventLine(event)}`);
  }
}

export async function notifySourceHealthChange(source, health, previousHealth) {
  if (!enabled()) return;
  const status = String(health?.status || "");
  const previousStatus = String(previousHealth?.status || "");
  if (!status || status === previousStatus) return;
  if (status === "error") {
    await sendTelegramMessage(
      [
        "<b>⚠️ SOURCE CHECK</b>",
        divider,
        field("Website:", source?.name || source?.id || "Source", "🌐"),
        field("Status:", "Needs attention", "📡"),
        field("Details:", cleanHealthError(health?.lastError), "📝"),
        divider,
      ].join("\n")
    );
  } else if (status === "ok" && previousStatus === "error") {
    await sendTelegramMessage(
      [
        "<b>✅ SOURCE RECOVERED</b>",
        divider,
        field("Website:", source?.name || source?.id || "Source", "🌐"),
        field("Status:", "Working again", "📡"),
        divider,
      ].join("\n")
    );
  }
}

export function telegramStatus() {
  return enabled() ? "enabled" : "disabled";
}

function helpText() {
  return [
    "<b>⚡ LIVE FEED HUB BOT</b>",
    divider,
    field("/status", "server summary", "📊"),
    field("/sources", "source health", "📡"),
    field("/sites", "clickable site feed menu", "🌐"),
    field("/feed", "latest all sites", "🚀"),
    field("/feed apucash", "latest from one source", "🎯"),
    field("/top", "daily top offers", "🏆"),
    field("/topcoins", "highest coin offers today", "💎"),
    field("/search binance", "search feed history", "🔎"),
    divider,
  ].join("\n");
}

function formatFeed(events, title = "Latest Feed") {
  const filtered = events.filter(passesTelegramContentFilter);
  if (!filtered.length) return "No feed rows matched Telegram filters yet.";
  return `<b>🚀 ${escapeHtml(title.toUpperCase())}</b>\n${filtered.slice(0, 10).map(eventLine).join("\n")}`;
}

function formatSources(sources) {
  const rows = sources
    .slice(0, 40)
    .map((source) => {
      const health = source.health || {};
      const status = health.status === "ok" ? "OK" : health.status === "error" ? "ERROR" : "SYNCING";
      return `<b>${escapeHtml(source.name)}</b> | ${escapeHtml(status)} | ${escapeHtml(health.count || 0)} rows`;
    })
    .join("\n");
  return `<b>📡 SOURCE HEALTH</b>\n${divider}\n${rows}\n${divider}`;
}

function sourceNameMap(sources) {
  const map = new Map();
  for (const source of sources || []) {
    if (source?.id) map.set(String(source.id), String(source.name || source.id));
  }
  return map;
}

function sourceButtons(sources, action = "feed") {
  const enabledSources = (sources || []).filter((source) => source?.id);
  const rows = [];
  for (let i = 0; i < enabledSources.length; i += 2) {
    rows.push(
      enabledSources.slice(i, i + 2).map((source) => ({
        text: String(source.name || source.id),
        callback_data: `${action}:${source.id}`,
      }))
    );
  }
  return { inline_keyboard: rows };
}

function resolveSource(input, sources) {
  const needle = String(input || "").trim().toLowerCase();
  if (!needle || needle === "all") return "all";
  return (
    (sources || []).find((source) => {
      const id = String(source?.id || "").toLowerCase();
      const name = String(source?.name || "").toLowerCase();
      return id === needle || name === needle || name.replace(/\s+/g, "") === needle;
    })?.id || input
  );
}

function formatTopOffers(data, sources = []) {
  const names = sourceNameMap(sources);
  const blocks = Object.entries(data.bySource || {});
  if (!blocks.length) return "No top offers yet today.";
  const rows = blocks
    .slice(0, 8)
    .map(([sourceId, block]) => {
      const rows = (block.byCoins || block.byFrequency || [])
        .filter(passesTelegramOfferFilter)
        .slice(0, 5)
        .map(
          (offer) =>
            `#${offer.rank} ${escapeHtml(offer.offer)} — ${escapeHtml(offer.maxRawAmount || `${offer.maxAmount}`)}\n${field("Last lead:", formatLeadTime(offer.latestAt), "⏱️")}`
        )
        .join("\n");
      return `${divider}\n<b>${escapeHtml(names.get(sourceId) || sourceId)}</b>\n${rows || "No rows"}`;
    })
    .join("\n\n");
  return `<b>🏆 DAILY TOP OFFERS</b>\n${rows}\n${divider}`;
}

function formatTopCoins(data, sources = [], limit = 15) {
  const names = sourceNameMap(sources);
  const rows = Object.entries(data.bySource || {})
    .flatMap(([sourceId, block]) =>
      (block.byCoins || []).map((offer) => ({
        ...offer,
        sourceId,
        sourceName: names.get(sourceId) || sourceId,
      }))
    )
    .filter(passesTelegramOfferFilter)
    .sort((a, b) => Number(b.maxAmount || 0) - Number(a.maxAmount || 0) || Number(b.count || 0) - Number(a.count || 0))
    .slice(0, limit);

  if (!rows.length) return "No high coin offers recorded yet today.";
  return [
    `<b>💎 HIGHEST COIN OFFERS</b>`,
    field("Day:", data.day || "today", "📅"),
    divider,
    ...rows.map(
      (offer, index) =>
        `#${index + 1} <b>${escapeHtml(offer.sourceName)}</b>\n${field("Offer:", offer.offer, "🎯")}\n${field("Reward:", offer.maxRawAmount || `${offer.maxAmount}`, "💰")}\n${field("Last lead:", formatLeadTime(offer.latestAt), "⏱️")}`
    ),
    divider,
  ].join("\n");
}

function formatAutoTopReport(data, sources = [], title = "📌 HOURLY TOP REPORT") {
  const names = sourceNameMap(sources);
  const sourceRows = Object.entries(data.bySource || {});
  const byFrequency = sourceRows
    .flatMap(([sourceId, block]) =>
      (block.byFrequency || [])
        .filter(passesTelegramOfferFilter)
        .map((offer) => ({
          ...offer,
          sourceName: names.get(sourceId) || sourceId,
        }))
    )
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || Number(b.maxAmount || 0) - Number(a.maxAmount || 0))
    .slice(0, 10);
  const byCoins = sourceRows
    .flatMap(([sourceId, block]) =>
      (block.byCoins || [])
        .filter(passesTelegramOfferFilter)
        .map((offer) => ({
          ...offer,
          sourceName: names.get(sourceId) || sourceId,
        }))
    )
    .sort((a, b) => Number(b.maxAmount || 0) - Number(a.maxAmount || 0) || Number(b.count || 0) - Number(a.count || 0))
    .slice(0, 10);

  if (!byFrequency.length && !byCoins.length) return "No top offers recorded yet.";

  const frequencyRows = byFrequency.length
    ? byFrequency
        .map(
          (offer, index) =>
            `#${index + 1} <b>${escapeHtml(offer.sourceName)}</b>\n${field("Offer:", offer.offer, "🎯")}\n${field("Hits:", `${offer.count}x`, "🔁")}\n${field("Last lead:", formatLeadTime(offer.latestAt), "⏱️")}`
        )
        .join("\n")
    : "No rows";
  const coinRows = byCoins.length
    ? byCoins
        .map(
          (offer, index) =>
            `#${index + 1} <b>${escapeHtml(offer.sourceName)}</b>\n${field("Offer:", offer.offer, "🎯")}\n${field("Reward:", offer.maxRawAmount || `${offer.maxAmount}`, "💰")}\n${field("Last lead:", formatLeadTime(offer.latestAt), "⏱️")}`
        )
        .join("\n")
    : "No rows";

  return [
    `<b>${title}</b>`,
    field("Day:", data.day || "today", "📅"),
    field("Timezone:", "BDT", "⏰"),
    field("Generated:", new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }), "🕒"),
    divider,
    "<b>🏆 TOP OFFERS - MOST COMPLETED</b>",
    frequencyRows,
    divider,
    "<b>💎 TOP COINS - HIGHEST REWARD</b>",
    coinRows,
    divider,
  ].join("\n");
}

function formatEmptyTopReport(title = "📌 HOURLY TOP REPORT") {
  return [
    `<b>${title}</b>`,
    field("Timezone:", "BDT", "⏰"),
    field("Generated:", new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }), "🕒"),
    divider,
    "<b>No valid top offers yet after filters.</b>",
    "Survey, mail verification, and under-200 coin leads are excluded.",
    divider,
  ].join("\n");
}

function formatSearchResults(events, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return "Usage: /search offer-name";
  const words = needle.split(/\s+/).filter(Boolean);
  const rows = events
    .filter((event) => {
      if (!passesTelegramContentFilter(event)) return false;
      const haystack = [
        event.sourceName,
        event.offerwall,
        event.offerName,
        event.offer,
        event.user,
        event.rawAmount,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .slice(0, 10);
  if (!rows.length) return `No history found for: ${escapeHtml(query)}`;
  return `<b>🔎 SEARCH RESULTS</b>\n${field("Query:", query, "⌨️")}\n${rows.map(eventLine).join("\n")}`;
}

async function sendAndPinTopReport(handlers, target = chatId, title = "📌 HOURLY TOP REPORT") {
  const sources = handlers.getSources();
  const text = formatAutoTopReport(
    handlers.getDailyTopOffers({ source: "all", limit: topCoinsPinLimit }),
    sources,
    title
  );
  const messageText = text.startsWith("No top offers") ? formatEmptyTopReport(title) : text;
  const message = await sendTelegramMessage(messageText, target);
  await pinTelegramMessage(message?.message_id, target);
  return true;
}

function msUntilNextHour() {
  const now = new Date();
  const elapsed = now.getMinutes() * 60_000 + now.getSeconds() * 1000 + now.getMilliseconds();
  return Math.max(1000, 3_600_000 - elapsed);
}

function dhakaClockParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { hour: get("hour") % 24, minute: get("minute"), second: get("second") };
}

function msUntilNextDhakaTime(value) {
  const [targetHourRaw, targetMinuteRaw] = String(value || "00:00").split(":");
  const targetHour = Math.min(23, Math.max(0, Number(targetHourRaw) || 0));
  const targetMinute = Math.min(59, Math.max(0, Number(targetMinuteRaw) || 0));
  const now = new Date();
  const current = dhakaClockParts(now);
  const currentMinutes = current.hour * 60 + current.minute;
  const targetMinutes = targetHour * 60 + targetMinute;
  let diffMinutes = targetMinutes - currentMinutes;
  if (diffMinutes <= 0) diffMinutes += 24 * 60;
  const elapsedCurrentMinute = current.second * 1000 + now.getMilliseconds();
  return Math.max(1000, diffMinutes * 60_000 - elapsedCurrentMinute);
}

function startAutoTopPin(handlers) {
  if (!autoTopPinEnabled || autoTopPinStarted) return;
  autoTopPinStarted = true;

  const run = async () => {
    try {
      const pinned = await sendAndPinTopReport(handlers);
      console.log(`[telegram] hourly top report pin ${pinned ? "sent" : "skipped"}`);
    } catch (err) {
      console.warn(`[telegram] hourly top report pin failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const schedule = () => {
    const delay = msUntilNextHour();
    setTimeout(() => {
      run();
      schedule();
    }, delay);
  };

  schedule();
  console.log("[telegram] hourly top report pin on each clock hour");
}

function startDailyTopPin(handlers) {
  if (!dailyTopPinEnabled || dailyTopPinStarted) return;
  dailyTopPinStarted = true;

  const run = async () => {
    try {
      const pinned = await sendAndPinTopReport(handlers, chatId, "📅 DAILY TOP REPORT");
      console.log(`[telegram] daily top report pin ${pinned ? "sent" : "skipped"}`);
    } catch (err) {
      console.warn(`[telegram] daily top report pin failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const schedule = () => {
    const delay = msUntilNextDhakaTime(dailyTopPinTime);
    setTimeout(() => {
      run();
      schedule();
    }, delay);
  };

  schedule();
  console.log(`[telegram] daily top report pin at ${dailyTopPinTime} BDT`);
}

async function getUpdates() {
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  url.searchParams.set("timeout", "25");
  if (updateOffset) url.searchParams.set("offset", String(updateOffset));
  const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
  if (!res.ok) throw new Error(`Telegram getUpdates HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.result) ? json.result : [];
}

async function answerCallbackQuery(id) {
  if (!id) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: id }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => {});
}

/**
 * @param {{
 *   getEvents: (opts?: { source?: string, limit?: number }) => import('./types.js').FeedEvent[],
 *   getDailyTopOffers: (opts?: { source?: string, limit?: number }) => unknown,
 *   getSources: () => unknown[],
 *   getStats: () => unknown,
 * }} handlers
 */
export function startTelegramBot(handlers) {
  if (!enabled()) return;
  startAutoTopPin(handlers);
  startDailyTopPin(handlers);
  if (!commandsEnabled) {
    console.log("[telegram] bot commands disabled; top report pins enabled");
    return;
  }
  if (botStarted) return;
  botStarted = true;

  const loop = async () => {
    while (botStarted) {
      try {
        const updates = await getUpdates();
        for (const update of updates) {
          updateOffset = Number(update.update_id || 0) + 1;
          const callback = update.callback_query;
          if (callback) {
            const target = String(callback.message?.chat?.id || "");
            if (!target || !isAllowedChat(target)) continue;
            const [action, sourceId] = String(callback.data || "").split(":", 2);
            const sources = handlers.getSources();
            await answerCallbackQuery(callback.id);

            if (action === "feed") {
              const source = resolveSource(sourceId, sources);
              const name = sourceNameMap(sources).get(source) || source;
              await sendTelegramMessage(
                formatFeed(handlers.getEvents({ source, limit: 10 }), `${name} Feed`),
                target,
                { reply_markup: sourceButtons(sources, "feed") }
              );
            } else if (action === "top") {
              const source = resolveSource(sourceId, sources);
              await sendTelegramMessage(
                formatTopOffers(handlers.getDailyTopOffers({ source, limit: 5 }), sources),
                target,
                { reply_markup: sourceButtons(sources, "top") }
              );
            }
            continue;
          }

          const message = update.message;
          const text = String(message?.text || "").trim();
          const target = String(message?.chat?.id || "");
          if (!text || !target || !isAllowedChat(target)) continue;

          const [cmdRaw, argRaw] = text.split(/\s+/, 2);
          const cmd = cmdRaw.split("@")[0].toLowerCase();
          const arg = argRaw?.trim();
          const sources = handlers.getSources();

          if (cmd === "/start" || cmd === "/help") {
            await sendTelegramMessage(helpText(), target);
          } else if (cmd === "/status") {
            const stats = handlers.getStats();
            await sendTelegramMessage(
              [
                "<b>📊 STATUS</b>",
                divider,
                field("Total rows:", stats.total || 0, "📦"),
                field("Last updated:", stats.lastUpdated || "none", "⏰"),
                divider,
              ].join("\n"),
              target
            );
          } else if (cmd === "/sources") {
            await sendTelegramMessage(formatSources(handlers.getSources()), target);
          } else if (cmd === "/sites") {
            await sendTelegramMessage(`<b>🌐 SELECT WEBSITE</b>\n${divider}`, target, {
              reply_markup: sourceButtons(sources, "feed"),
            });
          } else if (cmd === "/feed") {
            const source = resolveSource(arg || "all", sources);
            const title = source === "all" ? "All Sites Feed" : `${sourceNameMap(sources).get(source) || source} Feed`;
            await sendTelegramMessage(
              formatFeed(handlers.getEvents({ source, limit: 10 }), title),
              target,
              { reply_markup: sourceButtons(sources, "feed") }
            );
          } else if (cmd === "/top") {
            const source = resolveSource(arg || "all", sources);
            await sendTelegramMessage(
              formatTopOffers(handlers.getDailyTopOffers({ source, limit: 5 }), sources),
              target,
              { reply_markup: sourceButtons(sources, "top") }
            );
          } else if (cmd === "/topcoins") {
            await sendTelegramMessage(formatTopCoins(handlers.getDailyTopOffers({ source: "all", limit: 8 }), sources), target);
          } else if (cmd === "/search") {
            await sendTelegramMessage(
              formatSearchResults(handlers.getEvents({ source: "all", limit: 400 }), arg || ""),
              target
            );
          } else {
            await sendTelegramMessage(helpText(), target);
          }
        }
      } catch (err) {
        console.warn(`[telegram] ${err instanceof Error ? err.message : String(err)}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };

  loop();
  console.log("[telegram] bot commands enabled");
}
