import { fetchTickerApi } from "./ticker-api.js";
import { fetchHtmlLivewire } from "./html-livewire.js";
import { fetchPaidcash } from "./paidcash.js";
import { fetchGamersuniverse } from "./gamersuniverse.js";
import { fetchJsonFeed } from "./json-feed.js";
import { fetchZxearnHtml } from "./zxearn-html.js";
import { fetchGraphqlFeed } from "./graphql-feed.js";
import { fetchCashlyearnPublic } from "./cashlyearn-public.js";
import { fetchLiveTable } from "./live-table.js";
import { fetchAuthHistoryTable } from "./auth-history-table.js";
import { fetchRevnoDashboard } from "./revno-dashboard.js";
import { fetchPaidBytePublic } from "./paidbyte-public.js";
import { fetchTrevbucksLivewire } from "./trevbucks-livewire.js";

/** @type {Record<string, (source: Record<string, unknown>) => Promise<import('../types.js').FeedEvent[]>>} */
const handlers = {
  "ticker-api": fetchTickerApi,
  "html-livewire": fetchHtmlLivewire,
  "paidcash-browser": fetchPaidcash,
  "gamersuniverse-html": fetchGamersuniverse,
  "json-feed": fetchJsonFeed,
  "zxearn-html": fetchZxearnHtml,
  "graphql-feed": fetchGraphqlFeed,
  "cashlyearn-public": fetchCashlyearnPublic,
  "live-table": fetchLiveTable,
  "auth-history-table": fetchAuthHistoryTable,
  "revno-dashboard": fetchRevnoDashboard,
  "paidbyte-public": fetchPaidBytePublic,
  "trevbucks-livewire": fetchTrevbucksLivewire,
};

/**
 * @param {Record<string, unknown>} source
 */
export async function fetchSource(source) {
  const handler = handlers[/** @type {string} */ (source.type)];
  if (!handler) {
    throw new Error(`Unknown adapter type: ${source.type}`);
  }
  return handler(source);
}
