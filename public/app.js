const tickerInner = document.getElementById("tickerInner");
const feedList = document.getElementById("feedList");
const feedCount = document.getElementById("feedCount");
const sourceFilters = document.getElementById("sourceFilters");
const sourceHealth = document.getElementById("sourceHealth");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const paginationEl = document.getElementById("pagination");
const topOffersGrid = document.getElementById("topOffersGrid");
const sourceTotal = document.getElementById("sourceTotal");
const summaryEvents = document.getElementById("summaryEvents");
const summaryOnline = document.getElementById("summaryOnline");
const summaryView = document.getElementById("summaryView");
const summaryLast = document.getElementById("summaryLast");

let activeSource = "all";
let currentPage = 1;
let totalPages = 1;
let pageSize = 30;
let historyPages = 30;
let lastServerlessRefresh = 0;

const isServerlessHost =
  location.hostname.includes("vercel.app") ||
  location.hostname.includes("netlify.app") ||
  location.hostname.includes("netlifyglobalcdn.com");

/** @type {Map<string, { name: string, color: string }>} */
const sourceMeta = new Map();
/** @type {FeedEvent[]} */
let allEvents = [];
/** @type {Array<Record<string, any>>} */
let cachedSources = [];
let latestStats = { total: 0, sources: {} };

/**
 * @typedef {Object} FeedEvent
 * @property {string} id
 * @property {string} source
 * @property {string} sourceName
 * @property {string} user
 * @property {string} offer
 * @property {string} [offerwall]
 * @property {string|null} [offerName]
 * @property {string|null} [country]
 * @property {boolean} [isPrivate]
 * @property {number} amount
 * @property {string} unit
 * @property {string} at
 * @property {string} [rawAmount]
 */

function formatTimeAbsolute(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "--";
  }
}

function formatTimeRelative(iso) {
  try {
    const d = new Date(iso);
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  } catch {
    return "";
  }
}

function shortSourceName(id) {
  if (id === "all") return "All";
  return sourceMeta.get(id)?.name || id;
}

function updateSummary(sources = cachedSources, pagination = null) {
  const list = Array.isArray(sources) ? sources : [];
  const online = list.filter((s) => s.health?.status === "ok").length;
  const currentList = filteredEvents();
  const total = pagination?.total ?? currentList.length;
  summaryEvents.textContent = String(total);
  summaryOnline.textContent = `${online}/${list.length || 0}`;
  summaryView.textContent = shortSourceName(activeSource);
  summaryLast.textContent = currentList[0]?.at ? formatTimeRelative(currentList[0].at) : "Waiting";
  sourceTotal.textContent = String(list.length || 0);
}

function displayAmount(e) {
  if (e.rawAmount) return e.rawAmount;
  if (e.unit === "USD") return `$${Number(e.amount || 0).toFixed(2)}`;
  return `${e.amount} ${e.unit || "points"}`;
}

/**
 * @param {FeedEvent} e
 */
function offerLines(e) {
  const normalizedOffer = String(e.offer || "").replace(/→/g, "->");
  const wall = e.offerwall || normalizedOffer.split(" -> ")[0]?.trim() || normalizedOffer || "Offer";
  let task = (e.offerName || "").trim();
  if (!task && normalizedOffer.includes(" -> ")) {
    const part = normalizedOffer.split(" -> ").slice(1).join(" -> ").trim();
    if (part && !part.startsWith("@")) task = part;
  }
  return { wall, task };
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = String(s ?? "");
  return d.innerHTML;
}

function withRefresh(params, force = false) {
  if (!isServerlessHost) return params;
  const now = Date.now();
  if (force || now - lastServerlessRefresh > 12000) {
    params.set("refresh", "1");
    lastServerlessRefresh = now;
  }
  return params;
}

function renderTickerCard(e) {
  const color = sourceMeta.get(e.source)?.color || "#22d3a8";
  const { wall, task } = offerLines(e);
  const country = e.country ? ` - ${e.country}` : "";
  const priv = e.isPrivate ? "Private " : "";
  return `<div class="ticker-card" style="--src-color:${color}">
    <span class="src">${escapeHtml(e.sourceName)}</span>
    <span class="user">${escapeHtml(e.user)}${escapeHtml(country)}</span>
    <span class="offer"><strong>${escapeHtml(priv + wall)}</strong>${task ? ` - <em>${escapeHtml(task)}</em>` : ""}</span>
    <span class="amt">${escapeHtml(displayAmount(e))}</span>
    <span class="time-mini">${escapeHtml(formatTimeRelative(e.at))}</span>
  </div>`;
}

/**
 * @param {FeedEvent} e
 */
function renderFeedItem(e) {
  const color = sourceMeta.get(e.source)?.color || "#22d3a8";
  const { wall, task } = offerLines(e);
  const priv = e.isPrivate ? '<span class="private-badge">Private</span>' : "";
  const countryLine = e.country ? `<span class="country-line">${escapeHtml(e.country)}</span>` : "";
  const offerLine = task
    ? `<span class="offer-task"><span class="offer-label">Offer</span>${escapeHtml(task)}</span>`
    : "";
  return `<li class="feed-item" data-id="${escapeHtml(e.id)}" style="--src-color:${color}">
    <span class="badge">${escapeHtml(e.sourceName)}</span>
    <div class="main">
      <strong>${escapeHtml(wall)}</strong>${priv}
      ${offerLine}
      <span class="user-line">@${escapeHtml(e.user)}</span>
      ${countryLine}
    </div>
    <span class="reward">${escapeHtml(displayAmount(e))}</span>
    <div class="time-block">
      <span class="time-rel">${escapeHtml(formatTimeRelative(e.at))}</span>
      <span class="time-abs">${escapeHtml(formatTimeAbsolute(e.at))}</span>
    </div>
  </li>`;
}

function filteredEvents() {
  if (activeSource === "all") return allEvents;
  return allEvents.filter((e) => e.source === activeSource);
}

function renderTicker() {
  const list = filteredEvents().slice(0, 30);
  if (!list.length) {
    tickerInner.innerHTML = '<div class="ticker-card"><span class="offer">Loading live feeds...</span></div>';
    return;
  }
  const cards = list.map(renderTickerCard).join("");
  tickerInner.innerHTML = cards + cards;
}

function renderPagination(pagination) {
  if (!pagination) {
    paginationEl.innerHTML = "";
    return;
  }

  currentPage = pagination.page;
  totalPages = pagination.totalPages;

  const buttons = [];
  for (let p = 1; p <= totalPages; p++) {
    buttons.push(
      `<button type="button" class="page-btn ${p === currentPage ? "active" : ""}" data-page="${p}">${p}</button>`
    );
  }

  paginationEl.innerHTML = `
    <button type="button" class="page-btn" data-page="prev" ${pagination.hasPrev ? "" : "disabled"}>Prev</button>
    ${buttons.join("")}
    <button type="button" class="page-btn" data-page="next" ${pagination.hasNext ? "" : "disabled"}>Next</button>
    <span class="page-info">${pagination.total} total - ${pageSize}/page</span>
  `;

  paginationEl.querySelectorAll(".page-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const raw = btn.getAttribute("data-page");
      if (btn.disabled || !raw) return;
      if (raw === "prev" && currentPage > 1) loadFeedPage(currentPage - 1);
      else if (raw === "next" && currentPage < totalPages) loadFeedPage(currentPage + 1);
      else if (raw !== "prev" && raw !== "next") loadFeedPage(Number(raw));
    });
  });
}

async function loadFeedPage(page = 1, opts = {}) {
  const params = new URLSearchParams({
    source: activeSource,
    page: String(page),
    pageSize: String(pageSize),
  });
  withRefresh(params, Boolean(opts.forceRefresh));
  const res = await fetch(`/api/feed?${params}`);
  const data = await res.json();
  const list = data.events || [];
  const pag = data.pagination;
  latestStats = data.stats || latestStats;

  for (const s of data.sources || []) {
    sourceMeta.set(s.id, { name: s.name, color: s.color || "#22d3a8" });
  }
  if (activeSource === "all" && list.length) {
    mergeEvents(list, false, { skipReload: true });
  }

  feedCount.textContent = pag ? `Page ${pag.page}/${pag.totalPages} - ${pag.total} events` : `${list.length} events`;

  if (!list.length) {
    const current = shortSourceName(activeSource);
    const message =
      activeSource === "all"
        ? "No history on this page yet."
        : `${current} has no visible rows right now. Show all sites to see the live feed.`;
    feedList.innerHTML = `<li class="empty">
      <p>${escapeHtml(message)}</p>
      ${activeSource === "all" ? "" : '<button type="button" class="empty-action" id="showAllFeed">Show all sites</button>'}
    </li>`;
    document.getElementById("showAllFeed")?.addEventListener("click", async () => {
      activeSource = "all";
      currentPage = 1;
      renderFilters(cachedSources);
      renderTicker();
      await loadFeedPage(1);
      await loadTopOffers();
    });
  } else {
    feedList.innerHTML = list.map(renderFeedItem).join("");
  }

  renderPagination(pag);
  updateSummary(cachedSources, pag);
}

async function loadTopOffers() {
  const params = new URLSearchParams({ source: activeSource, limit: "8" });
  withRefresh(params);
  const res = await fetch(`/api/top-offers?${params}`);
  const data = await res.json();
  const bySource = data.bySource || {};
  const entries = Object.entries(bySource);

  if (!entries.length) {
    topOffersGrid.innerHTML = '<p class="empty">Collecting today data... check back in a minute.</p>';
    return;
  }

  topOffersGrid.innerHTML = entries
    .map(([sourceId, block]) => {
      const meta = sourceMeta.get(sourceId);
      const name = meta?.name || sourceId;
      const color = meta?.color || "#22d3a8";
      const rows = block.offers
        .map(
          (o) => `
        <div class="top-offer-row">
          <span class="rank">#${o.rank}</span>
          <span class="name" title="${escapeHtml(o.offer)}">${escapeHtml(o.offer)}</span>
          <span class="hits">${o.count}x</span>
        </div>`
        )
        .join("");
      return `
      <article class="top-offers-card">
        <h3><span class="dot" style="background:${color}"></span>${escapeHtml(name)}</h3>
        ${rows}
      </article>`;
    })
    .join("");
}

function renderFilters(sources) {
  cachedSources = sources;
  updateSummary(sources);
  const statsBySource = latestStats.sources || {};
  const totalCount = Number(latestStats.total || 0) ||
    sources.reduce((sum, s) => sum + Number(s.health?.count || 0), 0);
  const buttons = [
    { id: "all", name: "All sites", color: "#22d3a8", count: totalCount },
    ...sources.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      count: statsBySource[s.id] ?? s.health?.count ?? 0,
    })),
  ];

  sourceFilters.innerHTML = buttons
    .map(
      (b) => `
    <button type="button" class="filter-btn ${activeSource === b.id ? "active" : ""}" data-source="${b.id}" style="--src-color:${b.color}">
      <span class="dot" style="background:${b.color}"></span>
      <span class="name">${escapeHtml(b.name)}</span>
      <span class="filter-count">${escapeHtml(b.count)}</span>
    </button>`
    )
    .join("");

  sourceFilters.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      activeSource = btn.getAttribute("data-source") || "all";
      currentPage = 1;
      renderFilters(sources);
      renderTicker();
      await loadFeedPage(1);
      await loadTopOffers();
    });
  });
}

function renderHealth(sources) {
  updateSummary(sources);
  sourceHealth.innerHTML = sources
    .map((s) => {
      const h = s.health;
      const cls = h.status === "ok" ? "ok" : h.status === "error" ? "err" : "";
      const latency = h.latencyMs ? `, ${(h.latencyMs / 1000).toFixed(1)}s` : "";
      const added = h.added ? `, +${h.added}` : "";
      const detail = h.status === "ok" ? `${h.count} items${added}${latency}` : h.lastError ? h.lastError.slice(0, 44) : "pending";
      const note = h.note ? `<div class="health-note" title="${escapeHtml(h.note)}">${escapeHtml(h.note)}</div>` : "";
      return `<div class="health-row"><span>${escapeHtml(s.name)}</span><span class="${cls}">${escapeHtml(detail)}</span></div>${note}`;
    })
    .join("");
}

/**
 * @param {FeedEvent[]} events
 */
function mergeEvents(events, prepend = false, opts = {}) {
  if (!events.length) return;
  const map = new Map(allEvents.map((e) => [e.id, e]));
  for (const e of events) {
    const prev = map.get(e.id);
    map.set(e.id, prev ? { ...prev, ...e } : e);
  }
  let list = [...map.values()];
  if (prepend) {
    const newIds = new Set(events.map((e) => e.id));
    const head = events.map((e) => map.get(e.id)).filter(Boolean);
    const rest = list.filter((e) => !newIds.has(e.id));
    list = [...head, ...rest];
  } else {
    list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }
  allEvents = list.slice(0, 500);
  updateSummary(cachedSources);
  renderTicker();
  if (currentPage === 1 && !opts.skipReload) loadFeedPage(1);
  if (!opts.skipReload) loadTopOffers();
}

async function loadInitial() {
  const bootParams = new URLSearchParams({
    source: activeSource,
    limit: String(pageSize * historyPages),
  });
  withRefresh(bootParams, true);
  const bootstrap = await fetch(`/api/feed?${bootParams}`);
  const bootData = await bootstrap.json();
  latestStats = bootData.stats || latestStats;
  for (const s of bootData.sources) {
    sourceMeta.set(s.id, { name: s.name, color: s.color || "#22d3a8" });
  }
  if (bootData.config) {
    pageSize = bootData.config.pageSize || 30;
    historyPages = bootData.config.historyPages || 3;
  }
  allEvents = bootData.events || [];

  const pageParams = new URLSearchParams({ source: activeSource, page: "1" });
  withRefresh(pageParams);
  const res = await fetch(`/api/feed?${pageParams}`);
  const data = await res.json();
  latestStats = data.stats || latestStats;
  renderFilters(data.sources);
  renderHealth(data.sources);
  renderTicker();
  statusDot.className = "status-dot live";
  statusText.textContent = "Loaded";
  await loadFeedPage(1);
  await loadTopOffers();
}

function connectStream() {
  if (isServerlessHost) {
    statusDot.className = "status-dot live";
    statusText.textContent = "Live refresh";
    return;
  }
  const es = new EventSource("/api/stream");

  es.onopen = () => {
    statusDot.className = "status-dot live";
    statusText.textContent = "Live";
  };

  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "hello" && Array.isArray(msg.data)) {
        mergeEvents(msg.data);
      }
      if (msg.type === "events" && Array.isArray(msg.data)) {
        mergeEvents(msg.data, true);
      }
    } catch {
      /* ignore malformed stream messages */
    }
  };

  es.onerror = () => {
    statusDot.className = "status-dot error";
    statusText.textContent = "Reconnecting...";
  };
}

setInterval(async () => {
  try {
    const params = new URLSearchParams();
    withRefresh(params);
    const res = await fetch(`/api/sources${params.size ? `?${params}` : ""}`);
    const data = await res.json();
    latestStats = data.stats || latestStats;
    renderHealth(data.sources);
    renderFilters(data.sources);
    statusDot.className = "status-dot live";
    if (statusText.textContent === "Connecting..." || statusText.textContent === "Reconnecting...") {
      statusText.textContent = "Loaded";
    }
    await loadTopOffers();
  } catch {
    /* ignore transient refresh errors */
  }
}, 15000);

setInterval(() => {
  if (currentPage === 1) loadFeedPage(1, { forceRefresh: isServerlessHost });
}, isServerlessHost ? 15000 : 60000);

loadInitial().then(connectStream);
