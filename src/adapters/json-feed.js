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

function goldtaskerRows(data) {
  return Array.isArray(data) ? data : [];
}

function lootycashRows(data) {
  return Array.isArray(data) ? data : [];
}

function earnlabRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizeGoldtasker(row, source) {
  const user = /** @type {Record<string, unknown>} */ (row.user ?? {});
  const username = String(user.name || "anonymous");
  const offerwall = String(row.offerwallName || "Offer");
  const offerName = String(row.offerName || "Offer");
  const reward = asNumber(row.reward);
  const at = String(row.createdAt || new Date().toISOString());
  const id = String(row.id || hashId(String(source.id), [username, offerwall, offerName, reward, at]));

  return {
    id: `${source.id}-${id}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: username,
    offer: truncate(`${offerwall} -> ${offerName}`),
    offerwall,
    offerName: truncate(offerName),
    country: null,
    isPrivate: user.isPublic && user.isPublic !== "OPEN",
    amount: reward,
    unit: "coins",
    rawAmount: `${reward.toLocaleString()} coins`,
    at,
  };
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizeLootycash(row, source) {
  const username = String(row.username || row.user_name || row.user_id || "anonymous");
  const offerwall = String(row.offerwall || row.type || "Offer");
  const offerName = String(row.offer_name || row.offerName || "Offer");
  const reward = asNumber(row.reward);
  const at = String(row.dateUTC || row.date || row.createdAt || new Date().toISOString());
  const id = String(row._id || row.transactionId || hashId(String(source.id), [username, offerwall, offerName, reward, at]));

  return {
    id: `${source.id}-${id}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: username.length > 18 ? `${username.slice(0, 18)}...` : username,
    userId: String(row.user_id || ""),
    offer: truncate(`${offerwall} -> ${offerName}`),
    offerwall,
    offerName: truncate(offerName),
    country: row.country ? String(row.country) : null,
    isPrivate: !row.username && Boolean(row.user_id),
    amount: reward,
    unit: "coins",
    rawAmount: `${reward.toLocaleString()} coins`,
    at,
  };
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizeEarnlab(row, source) {
  const user = /** @type {Record<string, unknown>} */ (row.user ?? {});
  const username = String(user.username || "Anonymous");
  const offerwall = String(row.subTitle || row.type || "Offer");
  const offerName = String(row.title || "Offer");
  const reward = asNumber(row.amount);
  const at = String(row.createdAt || row.date || new Date().toISOString());
  const id = String(row.id || hashId(String(source.id), [username, offerwall, offerName, reward]));

  return {
    id: `${source.id}-${id}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: username,
    offer: truncate(`${offerwall} -> ${offerName}`),
    offerwall,
    offerName: truncate(offerName),
    country: null,
    isPrivate: !user.id,
    amount: reward,
    unit: "coins",
    rawAmount: `${reward.toLocaleString()} coins`,
    at,
  };
}

const schemas = {
  goldtasker: { rows: goldtaskerRows, normalize: normalizeGoldtasker },
  lootycash: { rows: lootycashRows, normalize: normalizeLootycash },
  earnlab: { rows: earnlabRows, normalize: normalizeEarnlab },
};

/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchJsonFeed(source) {
  const schema = schemas[String(source.schema || source.id)];
  if (!schema) throw new Error(`${source.name}: unknown json-feed schema`);

  const res = await fetch(String(source.url), {
    headers: {
      Accept: "application/json",
      Referer: String(source.referer || new URL(String(source.url)).origin),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
    },
    signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
  });

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  const data = await res.json();
  return schema
    .rows(data)
    .slice(0, Number(source.limit) || 40)
    .map((row) => schema.normalize(row, source));
}
