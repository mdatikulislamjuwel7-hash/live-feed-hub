import crypto from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const GRAPHQL_URL = "https://api.redmonkey.app/graphql";
const LIVE_QUERY = `query GetLiveRewards {
  getLiveRewards {
    id
    userId
    name
    user
    avatar
    amount
    provider
  }
}`;
const OFFERS_QUERY = `query FetchOffers($oss: [String], $page: Int, $limit: Int) {
  fetchOffers(oss: $oss, page: $page, limit: $limit) {
    totalOffers
    offers {
      id
      name
      provider
      amount
      payout
      goals {
        id
        name
        amount
        payout
      }
    }
  }
}`;
const ALL_REWARDS_QUERY = `query GetAllRewards($page: Int) {
  getAllRewards(page: $page) {
    rewards {
      id
      name
      amount
      provider
      status
      createdAt
      rawCreatedAt
      user {
        id
        username
      }
    }
  }
}`;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function norm(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function near(a, b, eps = 0.0001) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function hashId(sourceId, parts) {
  return crypto
    .createHash("sha256")
    .update([sourceId, ...parts].join("|"))
    .digest("hex")
    .slice(0, 24);
}

function loadToken(source) {
  const envName = String(source.tokenEnv || "REDMONKEY_TOKEN").trim();
  if (envName && process.env[envName]?.trim()) return process.env[envName].trim();
  const file = String(source.tokenFile || "").trim();
  const path = file ? resolve(file) : "";
  if (path && existsSync(path)) return readFileSync(path, "utf8").trim();
  return "";
}

async function gql(query, variables = {}, token = "") {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "https://redmonkey.app",
    Referer: "https://redmonkey.app/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`RedMonkey GraphQL HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || "GraphQL error");
  }
  return json.data;
}

/**
 * @param {Record<string, unknown>[]} offers
 */
function buildCatalogIndex(offers) {
  /** @type {Array<{ provider: string, offerName: string, amount: number, payout: number }>} */
  const rows = [];
  for (const offer of offers) {
    const provider = cleanText(offer.provider);
    const offerTitle = cleanText(offer.name);
    rows.push({
      provider,
      offerName: offerTitle,
      amount: Number(offer.amount) || 0,
      payout: Number(offer.payout) || 0,
    });
    for (const goal of /** @type {Record<string, unknown>[]} */ (offer.goals || [])) {
      const goalName = cleanText(goal.name);
      rows.push({
        provider,
        offerName: goalName ? `${offerTitle} — ${goalName}` : offerTitle,
        amount: Number(goal.amount) || 0,
        payout: Number(goal.payout) || 0,
      });
    }
  }
  return rows;
}

/**
 * Only use an exact unique match so we don't invent wrong titles.
 * @param {Array<{ provider: string, offerName: string, amount: number, payout: number }>} catalog
 * @param {string} provider
 * @param {number} amount
 */
function matchCatalogTitle(catalog, provider, amount) {
  const p = norm(provider);
  if (!p || !Number.isFinite(amount)) return "";

  const candidates = catalog.filter((row) => {
    const ip = norm(row.provider);
    if (!(ip === p || ip.includes(p) || p.includes(ip))) return false;
    return (
      near(row.payout, amount) ||
      near(row.amount, amount) ||
      near(row.amount, amount * 1000) ||
      near(row.payout, amount / 1000)
    );
  });

  const titles = [...new Set(candidates.map((row) => row.offerName).filter(Boolean))];
  return titles.length === 1 ? titles[0] : "";
}

async function fetchOfferCatalog() {
  const offers = new Map();
  for (const oss of [[], ["android"], ["ios"], ["windows"]]) {
    for (let page = 1; page <= 4; page += 1) {
      try {
        const data = await gql(OFFERS_QUERY, { oss, page, limit: 50 });
        const chunk = data?.fetchOffers?.offers || [];
        for (const offer of chunk) offers.set(String(offer.id), offer);
        if (!chunk.length) break;
      } catch {
        break;
      }
    }
  }
  return buildCatalogIndex([...offers.values()]);
}

/**
 * Admin-facing rewards list includes real `name` titles.
 * @param {string} token
 * @param {number} maxPages
 */
async function fetchAuthRewardTitles(token, maxPages = 5) {
  /** @type {Map<string, string>} */
  const byKey = new Map();
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await gql(ALL_REWARDS_QUERY, { page }, token);
    const rewards = data?.getAllRewards?.rewards || [];
    if (!rewards.length) break;
    for (const reward of rewards) {
      const user = cleanText(reward?.user?.username);
      const provider = cleanText(reward?.provider);
      const amount = Number(reward?.amount) || 0;
      const title = cleanText(reward?.name);
      if (!user || !title) continue;
      byKey.set(`${norm(user)}|${norm(provider)}|${amount}`, title);
      byKey.set(`${norm(user)}|${amount}`, title);
    }
  }
  return byKey;
}

/**
 * RedMonkey live ticker only exposes wall/provider publicly.
 * Enrich titles from offer catalog unique matches, and optionally from
 * authenticated getAllRewards when REDMONKEY_TOKEN is provided.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('../types.js').FeedEvent[]>}
 */
export async function fetchRedmonkey(source) {
  const live = (await gql(LIVE_QUERY))?.getLiveRewards;
  if (!Array.isArray(live) || !live.length) {
    throw new Error(`${source.name}: no live rewards`);
  }

  const catalogPromise = fetchOfferCatalog().catch((err) => {
    console.warn(
      `[redmonkey] catalog enrich failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return [];
  });

  const token = loadToken(source);
  const authPromise = token
    ? fetchAuthRewardTitles(token, Number(source.authRewardPages) || 5).catch((err) => {
        console.warn(
          `[redmonkey] auth rewards failed: ${err instanceof Error ? err.message : String(err)}`
        );
        return new Map();
      })
    : Promise.resolve(new Map());

  const [catalog, authTitles] = await Promise.all([catalogPromise, authPromise]);
  const at = new Date().toISOString();
  let named = 0;

  const events = live.map((row) => {
    const user = cleanText(row.user) || "anonymous";
    const offerwall = cleanText(row.provider || row.name) || "Offer";
    const amount = Number(row.amount) || 0;
    const authTitle =
      authTitles.get(`${norm(user)}|${norm(offerwall)}|${amount}`) ||
      authTitles.get(`${norm(user)}|${amount}`) ||
      "";
    const catalogTitle = matchCatalogTitle(catalog, offerwall, amount);
    const offerName = authTitle || catalogTitle || `${offerwall} live offer`;
    if (authTitle || catalogTitle) named += 1;

    return {
      id: `${source.id}-${row.id || hashId(String(source.id), [user, offerwall, offerName, amount])}`,
      source: String(source.id),
      sourceName: String(source.name),
      user,
      offer: `${offerwall} → ${offerName}`,
      offerwall,
      offerName,
      country: null,
      isPrivate: false,
      userId: row.userId != null ? String(row.userId) : undefined,
      amount,
      unit: String(source.unit || "coins"),
      rawAmount: `${amount.toLocaleString()} ${String(source.unit || "coins")}`,
      at,
    };
  });

  console.log(`[redmonkey] ${events.length} items, ${named} titled`);
  return events.slice(0, Number(source.limit) || 40);
}
