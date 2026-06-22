import { fetchTickerApi } from "./ticker-api.js";
import { fetchHtmlLivewire } from "./html-livewire.js";
import { fetchApucashInertia } from "./apucash-inertia.js";
import { fetchPaidcash } from "./paidcash.js";
import { fetchGamersuniverse } from "./gamersuniverse.js";
import { fetchLaravelLiveFeed } from "./laravel-live-feed.js";
import { fetchJsonFeed } from "./json-feed.js";
import { fetchGraphqlFeed } from "./graphql-feed.js";
import { fetchZxearnHtml } from "./zxearn-html.js";
import { fetchCashlyearnPublic } from "./cashlyearn-public.js";
import { fetchLiveTable } from "./live-table.js";
import { fetchPaidBytePublic } from "./paidbyte-public.js";
import { fetchTrevbucksLivewire } from "./trevbucks-livewire.js";
import { fetchSplitdropPublic } from "./splitdrop-public.js";
import { fetchEarnfinoLeaderboard } from "./earnfino-leaderboard.js";
import { fetchRevnoDashboard } from "./revno-dashboard.js";
import { fetchSwiperCsmFeed } from "./swiper-csm-feed.js";
import { fetchTickerCardsHtml } from "./ticker-cards-html.js";
import { fetchPublicLiveFeed } from "./public-live-feed.js";
import { fetchCovencashPusher } from "./covencash-pusher.js";

/** @type {Record<string, (source: Record<string, unknown>) => Promise<import('../types.js').FeedEvent[]>>} */
const handlers = {
  "ticker-api": fetchTickerApi,
  "html-livewire": fetchHtmlLivewire,
  "apucash-inertia": fetchApucashInertia,
  "paidcash-browser": fetchPaidcash,
  "gamersuniverse-html": fetchGamersuniverse,
  "laravel-live-feed": fetchLaravelLiveFeed,
  "json-feed": fetchJsonFeed,
  "graphql-feed": fetchGraphqlFeed,
  "zxearn-html": fetchZxearnHtml,
  "cashlyearn-public": fetchCashlyearnPublic,
  "live-table": fetchLiveTable,
  "paidbyte-public": fetchPaidBytePublic,
  "trevbucks-livewire": fetchTrevbucksLivewire,
  "splitdrop-public": fetchSplitdropPublic,
  "earnfino-leaderboard": fetchEarnfinoLeaderboard,
  "revno-dashboard": fetchRevnoDashboard,
  "swiper-csm-feed": fetchSwiperCsmFeed,
  "ticker-cards-html": fetchTickerCardsHtml,
  "public-live-feed": fetchPublicLiveFeed,
  "covencash-pusher": fetchCovencashPusher,
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
