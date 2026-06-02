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

async function fetchJson(url, source) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Origin: "https://paidbyte.com",
      Referer: "https://paidbyte.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 12000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  return res.json();
}

function getRows(data) {
  if (Array.isArray(data?.data?.leads)) return data.data.leads;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizePaidByte(row, source) {
  const userObj = /** @type {Record<string, unknown>} */ (row.userId ?? {});
  const username = String(userObj.username || row.username || "anonymous");
  const offerwall = String(row.provider || row.offerwall || row.type || "Offer");
  const offerName = String(row.offerName || row.title || row.name || "Offer").replace(`${offerwall} - `, "");
  const points = asNumber(row.points || row.reward || row.amount);
  const payout = asNumber(row.payout);
  const at = String(row.createdAt || row.date || row.updatedAt || new Date().toISOString());
  const id = String(row._id || row.id || row.offerTrxId || hashId(String(source.id), [username, offerwall, offerName, points, at]));

  return {
    id: `${source.id}-${id}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: username.length > 22 ? `${username.slice(0, 22)}...` : username,
    userId: String(userObj._id || row.userId || ""),
    offer: truncate(`${offerwall} -> ${offerName}`),
    offerwall,
    offerName: truncate(offerName),
    country: row.countryCode ? String(row.countryCode) : null,
    isPrivate: !userObj.username && Boolean(row.username),
    amount: points,
    unit: "points",
    rawAmount: payout > 0 ? `${points.toLocaleString()} pts / $${payout.toFixed(2)}` : `${points.toLocaleString()} points`,
    at,
  };
}

/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchPaidBytePublic(source) {
  const limit = Number(source.limit) || 50;
  const primaryUrl = new URL(String(source.url || "https://api.paidbyte.com/api/leads/live"));
  primaryUrl.searchParams.set("limit", String(limit));

  try {
    const data = await fetchJson(primaryUrl.toString(), source);
    const rows = getRows(data);
    if (rows.length) return rows.slice(0, limit).map((row) => normalizePaidByte(row, source));
  } catch (error) {
    if (!source.fallbackUrl) throw error;
  }

  if (!source.fallbackUrl) return [];
  const fallbackUrl = new URL(String(source.fallbackUrl));
  fallbackUrl.searchParams.set("limit", String(limit));
  const data = await fetchJson(fallbackUrl.toString(), source);
  return getRows(data)
    .slice(0, limit)
    .map((row) => normalizePaidByte(row, source));
}
