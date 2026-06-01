/**
 * Lightweight adapter loader for Netlify Functions. It avoids browser-only
 * adapters so the serverless bundle stays small and reliable.
 *
 * @param {Record<string, unknown>} source
 * @returns {Promise<import('./types.js').FeedEvent[]>}
 */
export async function fetchNetlifySource(source) {
  switch (source.type) {
    case "ticker-api":
      return (await import("./adapters/ticker-api.js")).fetchTickerApi(source);
    case "json-feed":
      return (await import("./adapters/json-feed.js")).fetchJsonFeed(source);
    case "graphql-feed":
      return (await import("./adapters/graphql-feed.js")).fetchGraphqlFeed(source);
    case "zxearn-html":
      return (await import("./adapters/zxearn-html.js")).fetchZxearnHtml(source);
    case "cashlyearn-public":
      return (await import("./adapters/cashlyearn-public.js")).fetchCashlyearnPublic(source);
    case "live-table":
      return (await import("./adapters/live-table.js")).fetchLiveTable(source);
    case "gamersuniverse-html":
      return (await import("./adapters/gamersuniverse.js")).fetchGamersuniverse(source);
    case "revno-dashboard":
      return (await import("./adapters/revno-dashboard.js")).fetchRevnoDashboard(source);
    default:
      throw new Error(`Netlify does not support adapter type: ${source.type}`);
  }
}

export function isNetlifySupportedSource(source) {
  if (!source.enabled) return false;
  if (source.type === "html-livewire") return false;
  if (source.type === "paidcash-browser") return false;
  if (source.type === "revno-dashboard" && !process.env.REVNO_COOKIE) return false;
  return true;
}

export function normalizeNetlifySource(source) {
  const copy = { ...source };
  if (copy.id === "revno" && process.env.REVNO_COOKIE) {
    copy.cookieEnv = "REVNO_COOKIE";
    delete copy.cookieFile;
  }
  if (copy.id === "apucash") copy.useBrowser = false;
  return copy;
}
