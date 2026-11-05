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

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
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

/** Offer completions only: the feed also carries cashouts, which are skipped. */
function paidkashRows(data) {
  return Array.isArray(data) ? data.filter((row) => row?.kind === "earn") : [];
}

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizeGoldtasker(row, source) {
  const user = /** @type {Record<string, unknown>} */ (row.user ?? {});
  const username = String(user.name || "anonymous");
  const offerwall = firstText(row.offerwallName, row.offerwall, row.network, row.provider, "Offer");
  const offerName = firstText(row.offerName, row.offer_name, row.title, row.name, row.description, "Offer");
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
  const offerwall = firstText(row.offerwall, row.offerwallName, row.network, row.provider, row.type, "Offer");
  const offerName = firstText(row.offer_name, row.offerName, row.title, row.name, row.description, "Offer");
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
  const type = String(row.type || "");
  const offerwall = String(row.subTitle || type || "Offer");
  const offerName = String(
    row.title ||
      (type === "WITHDRAWAL" && row.subTitle ? `${row.subTitle} withdrawal` : "") ||
      type.replace(/_/g, " ").toLowerCase() ||
      "Offer"
  );
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

/**
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizePaidkash(row, source) {
  const user = /** @type {Record<string, unknown>} */ (row.user ?? {});
  const provider = /** @type {Record<string, unknown>} */ (row.provider ?? {});
  const username = String(user.name || "Anonymous");
  const offerwall = firstText(provider.name, "Offer");
  const title = firstText(row.title, "Offer");
  const offerName = row.stepName ? `${title} - ${row.stepName}` : title;
  const amount = asNumber(row.amount);
  const at = String(row.at || new Date().toISOString());
  const id = String(row.id || hashId(String(source.id), [username, offerwall, offerName, amount, at]));

  return {
    id: `${source.id}-${id}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: username,
    userId: user.id ? String(user.id) : undefined,
    offer: truncate(`${offerwall} -> ${offerName}`),
    offerwall,
    offerName: truncate(offerName),
    country: null,
    isPrivate: !user.name,
    amount,
    unit: "USD",
    rawAmount: `$${amount.toFixed(3)}`,
    at,
  };
}

/**
 * The feed has no id, offer name or time, so rows are keyed on their content
 * and dated when first fetched, like the public-live-feed adapter.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizeRubcashly(row, source) {
  const username = firstText(row.name, "anonymous");
  const offerwall = firstText(row.offerwall, "Offer");
  const offerName = `${offerwall} live offer`;
  const coins = asNumber(row.coins);

  return {
    id: `${source.id}-${hashId(String(source.id), [username, offerwall, coins])}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: username,
    offer: `${offerwall} -> ${offerName}`,
    offerwall,
    offerName,
    country: null,
    isPrivate: false,
    amount: coins,
    unit: "coins",
    rawAmount: `${coins.toLocaleString()} coins`,
    at: new Date().toISOString(),
  };
}

/** Offer completions only: the feed also carries cashouts, which are skipped. */
function zxearnRows(data) {
  return Array.isArray(data?.items) ? data.items.filter((row) => row?.kind === "lead") : [];
}

/**
 * The feed names only the offer, not its offerwall.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizeZxearn(row, source) {
  const username = firstText(row.username, "anonymous");
  const offerwall = "Offer";
  const offerName = firstText(row.offer_title, row.source, "Offer");
  const points = asNumber(row.payout_points);
  const at = String(row.occurred_at || new Date().toISOString());
  const id = String(row.id || hashId(String(source.id), [username, offerName, points, at]));

  return {
    id: `${source.id}-${id}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: username,
    userId: row.user_id ? String(row.user_id) : undefined,
    offer: truncate(`${offerwall} -> ${offerName}`),
    offerwall,
    offerName: truncate(offerName),
    country: null,
    isPrivate: false,
    amount: points,
    unit: "coins",
    rawAmount: `${points.toLocaleString()} coins`,
    at,
  };
}

/** The feed lists withdrawals separately, so only completed offers are read. */
function jjrewardRows(data) {
  return Array.isArray(data?.completedOffers) ? data.completedOffers : [];
}

/**
 * The feed hides usernames and has no time, so rows are dated when first fetched.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} source
 * @returns {import('../types.js').FeedEvent}
 */
function normalizeJjreward(row, source) {
  const offerwall = firstText(row.partners, "Offer");
  const offerName = firstText(row.offer_name, "Offer");
  const reward = asNumber(row.reward);
  const id = String(row.id || hashId(String(source.id), [offerwall, offerName, reward]));

  return {
    id: `${source.id}-${id}`,
    source: String(source.id),
    sourceName: String(source.name),
    user: "anonymous",
    // Every user is anonymous, so the row id keeps separate completions from being merged as duplicates.
    userId: id,
    offer: truncate(`${offerwall} -> ${offerName}`),
    offerwall,
    offerName: truncate(offerName),
    country: row.country ? String(row.country) : null,
    isPrivate: true,
    amount: reward,
    unit: "coins",
    rawAmount: `${reward.toLocaleString()} coins`,
    at: new Date().toISOString(),
  };
}

const schemas = {
  jjreward: { rows: jjrewardRows, normalize: normalizeJjreward },
  zxearn: { rows: zxearnRows, normalize: normalizeZxearn },
  rubcashly: { rows: goldtaskerRows, normalize: normalizeRubcashly },
  goldtasker: { rows: goldtaskerRows, normalize: normalizeGoldtasker },
  lootycash: { rows: lootycashRows, normalize: normalizeLootycash },
  earnlab: { rows: earnlabRows, normalize: normalizeEarnlab },
  paidkash: { rows: paidkashRows, normalize: normalizePaidkash },
};

/** Node reports every network failure as "fetch failed" and keeps the reason in `cause`. */
function networkErrorText(err) {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err.cause : null;
  const detail = cause?.code || cause?.message;
  return detail ? `${message} (${detail})` : message;
}

/**
 * Retries network failures only. An HTTP response, including a block such as 403, is returned as is.
 * @param {Record<string, unknown>} source
 */
async function fetchWithRetry(source) {
  const retries = Math.max(0, Number(source.fetchRetries) || 0);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch(String(source.url), {
        headers: {
          Accept: "application/json",
          Referer: String(source.referer || new URL(String(source.url)).origin),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LiveFeedHub/1.0",
        },
        signal: AbortSignal.timeout(Number(source.timeoutMs) || 25000),
      });
    } catch (err) {
      if (attempt >= retries) throw new Error(`${source.name}: ${networkErrorText(err)}`);
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}

/**
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchJsonFeed(source) {
  const schema = schemas[String(source.schema || source.id)];
  if (!schema) throw new Error(`${source.name}: unknown json-feed schema`);

  const res = await fetchWithRetry(source);

  if (!res.ok) throw new Error(`${source.name}: HTTP ${res.status}`);
  const data = await res.json();
  return schema
    .rows(data)
    .slice(0, Number(source.limit) || 40)
    .map((row) => schema.normalize(row, source));
}
