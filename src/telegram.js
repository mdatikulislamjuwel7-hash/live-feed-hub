const token = process.env.TELEGRAM_BOT_TOKEN || "";
const chatId = process.env.TELEGRAM_CHAT_ID || "";
const allowedChatIds = new Set(
  String(process.env.TELEGRAM_ALLOWED_CHAT_IDS || chatId || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
const maxEventsPerBatch = Math.max(1, Number(process.env.TELEGRAM_BATCH_LIMIT || 5));
const minAmount = Number(process.env.TELEGRAM_MIN_AMOUNT || 0);
const sourceFilter = new Set(
  String(process.env.TELEGRAM_SOURCES || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);
const commandsEnabled = process.env.TELEGRAM_BOT_COMMANDS !== "false";

let updateOffset = 0;
let botStarted = false;

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

function isAllowedChat(id) {
  return !allowedChatIds.size || allowedChatIds.has(String(id));
}

function shouldAlert(event) {
  if (sourceFilter.size && !sourceFilter.has(String(event.source))) return false;
  if (Number(event.amount || 0) < minAmount) return false;
  return true;
}

function eventLine(event) {
  const name = event.offerName || event.offer || "Offer";
  const wall = event.offerwall || event.sourceName || "Source";
  const user = event.user ? `@${event.user}` : "unknown user";
  return [
    `<b>${escapeHtml(event.sourceName)}</b>`,
    `${escapeHtml(wall)} - ${escapeHtml(name)}`,
    `${escapeHtml(user)} | ${escapeHtml(amount(event))}`,
  ].join("\n");
}

export async function sendTelegramMessage(text, targetChatId = chatId) {
  if (!token || !targetChatId) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 180)}`);
  }
}

/**
 * @param {import('./types.js').FeedEvent[]} events
 */
export async function notifyTelegram(events) {
  if (!enabled() || !events.length) return;
  const filtered = events.filter(shouldAlert);
  if (!filtered.length) return;
  const rows = filtered.slice(0, maxEventsPerBatch).map(eventLine);
  const extra = filtered.length > rows.length ? `\n\n+${filtered.length - rows.length} more new rows` : "";
  const text = `Live Feed Hub\n\n${rows.join("\n\n")}${extra}`;
  await sendTelegramMessage(text);
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
    "/feed - latest all sites",
    "/feed apucash - latest from one source",
    "/top - daily top offers",
    "/top apucash - top offers for one source",
  ].join("\n");
}

function formatFeed(events) {
  if (!events.length) return "No feed rows yet.";
  return events.slice(0, 10).map(eventLine).join("\n\n");
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

function formatTopOffers(data) {
  const blocks = Object.entries(data.bySource || {});
  if (!blocks.length) return "No top offers yet today.";
  return blocks
    .slice(0, 8)
    .map(([sourceId, block]) => {
      const rows = (block.byCoins || block.byFrequency || [])
        .slice(0, 5)
        .map((offer) => `#${offer.rank} ${escapeHtml(offer.offer)} — ${escapeHtml(offer.maxRawAmount || `${offer.maxAmount}`)}`)
        .join("\n");
      return `<b>${escapeHtml(sourceId)}</b>\n${rows || "No rows"}`;
    })
    .join("\n\n");
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
          const message = update.message;
          const text = String(message?.text || "").trim();
          const target = String(message?.chat?.id || "");
          if (!text || !target || !isAllowedChat(target)) continue;

          const [cmdRaw, argRaw] = text.split(/\s+/, 2);
          const cmd = cmdRaw.split("@")[0].toLowerCase();
          const arg = argRaw?.trim();

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
          } else if (cmd === "/feed") {
            await sendTelegramMessage(
              formatFeed(handlers.getEvents({ source: arg || "all", limit: 10 })),
              target
            );
          } else if (cmd === "/top") {
            await sendTelegramMessage(
              formatTopOffers(handlers.getDailyTopOffers({ source: arg || "all", limit: 5 })),
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
