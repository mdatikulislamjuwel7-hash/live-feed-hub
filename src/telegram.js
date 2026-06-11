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
const dailyTopPinEnabled = process.env.TELEGRAM_DAILY_TOP_PIN !== "false";
const dailyTopPinIntervalMs =
  Math.max(1, Number(process.env.TELEGRAM_DAILY_TOP_PIN_HOURS || 24)) * 60 * 60 * 1000;
const topCoinsPinLimit = Math.min(
  40,
  Math.max(5, Number(process.env.TELEGRAM_TOPCOINS_PIN_LIMIT || 30))
);
const highCoinAmount = Number(process.env.TELEGRAM_HIGH_COIN_AMOUNT || 1000);
const highUsdAmount = Number(process.env.TELEGRAM_HIGH_USD_AMOUNT || 10);

let updateOffset = 0;
let botStarted = false;
let dailyTopPinStarted = false;

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
  return `${relative} (${new Date(time).toLocaleString("en-US", { timeZone: "UTC" })} UTC)`;
}

function isAllowedChat(id) {
  return !allowedChatIds.size || allowedChatIds.has(String(id));
}

function shouldAlert(event) {
  if (sourceFilter.size && !sourceFilter.has(String(event.source))) return false;
  return true;
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
    `<b>Website:</b> ${escapeHtml(event.sourceName || event.source)}`,
    `<b>Offer:</b> ${escapeHtml(name)}`,
    `<b>Offerwall:</b> ${escapeHtml(wall)}`,
    `<b>Reward:</b> ${escapeHtml(amount(event))}`,
    `<b>User:</b> ${escapeHtml(user)}`,
    `<b>Lead time:</b> ${escapeHtml(formatEventTime(event))}`,
  ].join("\n");
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
  const filtered = events.filter(shouldAlert);
  if (!filtered.length) return;
  for (const event of filtered) {
    const title = isHighValue(event) ? "High Coin Alert" : "Live Feed Hub";
    await sendTelegramMessage(`<b>${title}</b>\nNew live lead\n\n${eventLine(event)}`);
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
        "<b>Source Error</b>",
        "",
        `<b>${escapeHtml(source?.name || source?.id || "Source")}</b> is failing.`,
        escapeHtml(String(health?.lastError || "Unknown error")).slice(0, 700),
      ].join("\n")
    );
  } else if (status === "ok" && previousStatus === "error") {
    await sendTelegramMessage(
      `<b>Source Recovered</b>\n\n<b>${escapeHtml(source?.name || source?.id || "Source")}</b> is working again.`
    );
  }
}

export function telegramStatus() {
  return enabled() ? "enabled" : "disabled";
}

function helpText() {
  return [
    "<b>Live Feed Hub Bot</b>",
    "",
    "/status - server summary",
    "/sources - source health",
    "/sites - clickable site feed menu",
    "/feed - latest all sites",
    "/feed apucash - latest from one source",
    "/top - daily top offers",
    "/top apucash - top offers for one source",
    "/topcoins - highest coin offers today",
    "/search binance - search feed history",
  ].join("\n");
}

function formatFeed(events, title = "Latest Feed") {
  if (!events.length) return "No feed rows yet.";
  return `<b>${escapeHtml(title)}</b>\n\n${events.slice(0, 10).map(eventLine).join("\n\n")}`;
}

function formatSources(sources) {
  return sources
    .slice(0, 40)
    .map((source) => {
      const health = source.health || {};
      const icon = health.status === "ok" ? "✅" : health.status === "error" ? "❌" : "⏳";
      return `${icon} <b>${escapeHtml(source.name)}</b> — ${escapeHtml(health.status || "pending")} (${health.count || 0})`;
    })
    .join("\n");
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
  return blocks
    .slice(0, 8)
    .map(([sourceId, block]) => {
      const rows = (block.byCoins || block.byFrequency || [])
        .slice(0, 5)
        .map((offer) => `#${offer.rank} ${escapeHtml(offer.offer)} — ${escapeHtml(offer.maxRawAmount || `${offer.maxAmount}`)}`)
        .join("\n");
      return `<b>${escapeHtml(names.get(sourceId) || sourceId)}</b>\n${rows || "No rows"}`;
    })
    .join("\n\n");
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
    .sort((a, b) => Number(b.maxAmount || 0) - Number(a.maxAmount || 0) || Number(b.count || 0) - Number(a.count || 0))
    .slice(0, limit);

  if (!rows.length) return "No high coin offers recorded yet today.";
  return [
    `<b>Highest Coin Offers (${escapeHtml(data.day || "today")})</b>`,
    "",
    ...rows.map(
      (offer, index) =>
        `#${index + 1} <b>${escapeHtml(offer.sourceName)}</b>\n${escapeHtml(offer.offer)} — ${escapeHtml(offer.maxRawAmount || `${offer.maxAmount}`)}`
    ),
  ].join("\n");
}

function formatSearchResults(events, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return "Usage: /search offer-name";
  const words = needle.split(/\s+/).filter(Boolean);
  const rows = events
    .filter((event) => {
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
  return `<b>Search: ${escapeHtml(query)}</b>\n\n${rows.map(eventLine).join("\n\n")}`;
}

async function sendAndPinTopCoins(handlers, target = chatId) {
  const sources = handlers.getSources();
  const text = formatTopCoins(
    handlers.getDailyTopOffers({ source: "all", limit: topCoinsPinLimit }),
    sources,
    topCoinsPinLimit
  );
  if (text.startsWith("No high coin offers")) return false;
  const message = await sendTelegramMessage(text, target);
  await pinTelegramMessage(message?.message_id, target);
  return true;
}

function startDailyTopPin(handlers) {
  if (!dailyTopPinEnabled || dailyTopPinStarted) return;
  dailyTopPinStarted = true;

  const run = async () => {
    try {
      const pinned = await sendAndPinTopCoins(handlers);
      console.log(`[telegram] daily top coin pin ${pinned ? "sent" : "skipped"}`);
    } catch (err) {
      console.warn(`[telegram] daily top coin pin failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  setTimeout(() => {
    run();
    setInterval(run, dailyTopPinIntervalMs);
  }, dailyTopPinIntervalMs);
  console.log(`[telegram] daily top coin pin every ${Math.round(dailyTopPinIntervalMs / 3600000)}h`);
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
  if (!enabled() || !commandsEnabled || botStarted) return;
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
              `<b>Status</b>\nTotal rows: ${escapeHtml(stats.total || 0)}\nLast updated: ${escapeHtml(stats.lastUpdated || "none")}`,
              target
            );
          } else if (cmd === "/sources") {
            await sendTelegramMessage(formatSources(handlers.getSources()), target);
          } else if (cmd === "/sites") {
            await sendTelegramMessage("<b>Select a site feed</b>", target, {
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
  startDailyTopPin(handlers);
  console.log("[telegram] bot commands enabled");
}
