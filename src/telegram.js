const token = process.env.TELEGRAM_BOT_TOKEN || "";
const chatId = process.env.TELEGRAM_CHAT_ID || "";
const maxEventsPerBatch = Math.max(1, Number(process.env.TELEGRAM_BATCH_LIMIT || 5));

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

async function sendMessage(text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
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
  const rows = events.slice(0, maxEventsPerBatch).map(eventLine);
  const extra = events.length > rows.length ? `\n\n+${events.length - rows.length} more new rows` : "";
  const text = `Live Feed Hub\n\n${rows.join("\n\n")}${extra}`;
  await sendMessage(text);
}

export function telegramStatus() {
  return enabled() ? "enabled" : "disabled";
}
