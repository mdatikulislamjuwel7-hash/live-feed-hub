import crypto from "crypto";

function hashId(sourceId, parts) {
  return crypto
    .createHash("sha256")
    .update([sourceId, ...parts].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function asNumber(value) {
  const num = Number(String(value ?? "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function truncate(text, max = 120) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function rowsFrom(data) {
  if (Array.isArray(data?.leaderboard)) return data.leaderboard;
  if (Array.isArray(data?.data?.leaderboard)) return data.data.leaderboard;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * Earnfino exposes leaderboard data publicly. Transaction and withdrawal pages
 * are account routes, so this adapter only uses the visible public API.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchEarnfinoLeaderboard(source) {
  const url = String(source.url || "https://earnfino.com/api/leaderboard");
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Referer: "https://earnfino.com/leaderboard",
      Origin: "https://earnfino.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 20000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  const data = await res.json();
  const now = Date.now();
  const limit = Number(source.limit) || 40;

  return rowsFrom(data)
    .slice(0, limit)
    .map((row, index) => {
      const user = String(row.username || row.user || row.userId || "anonymous");
      const rank = asNumber(row.rank);
      const earned = asNumber(row.earned || row.amount || row.balance);
      const completed = asNumber(row.offersCompleted || row.completed || row.offers);
      const id = String(
        row.id ||
          row.userId ||
          hashId(String(source.id), [user, rank, earned, completed])
      );
      const offerName =
        completed > 0
          ? `${completed.toLocaleString()} offers completed`
          : "Leaderboard earner";

      return {
        id: `${source.id}-${id}`,
        source: String(source.id),
        sourceName: String(source.name),
        user: user.length > 22 ? `${user.slice(0, 22)}...` : user,
        userId: String(row.userId || ""),
        offer: truncate(`Rank #${rank || "?"} -> ${offerName}`),
        offerwall: `Rank #${rank || "?"}`,
        offerName,
        country: null,
        isPrivate: false,
        amount: earned,
        unit: "USD",
        rawAmount: `$${earned.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 3,
        })}`,
        at: new Date(now - index).toISOString(),
      };
    });
}
