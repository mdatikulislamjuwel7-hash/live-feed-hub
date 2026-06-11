import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { startPolling, getSources, getStats } from "./aggregator.js";
import { readPersistedState, writePersistedState } from "./persistence.js";
import { notifyTelegram, startTelegramBot, telegramStatus } from "./telegram.js";
import {
  buildPostbackUrl,
  createCustomClick,
  deleteCustomOffer,
  getCustomSource,
  listCustomOffers,
  loadCustomOfferState,
  recordCustomPostback,
  upsertCustomOffer,
} from "./custom-offers.js";
import {
  getEvents,
  getEventsPaginated,
  getDailyTopOffers,
  addSseClient,
  broadcastNew,
  getStats as storeStats,
  exportStoreState,
  hydrateStoreState,
  recordDailyImpressions,
  upsertMany,
  PAGE_SIZE,
  HISTORY_PAGES,
} from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3847;
const publicDir = join(__dirname, "..", "public");

app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));
app.use(express.static(publicDir));

function allSources() {
  const sources = getSources();
  const stats = storeStats();
  if (listCustomOffers().length || stats.sources?.custom) {
    return [...sources, getCustomSource()];
  }
  return sources;
}

function originFromReq(req) {
  return `${req.protocol}://${req.get("host")}`;
}

app.get("/api/feed", (req, res) => {
  const source = String(req.query.source || "all");
  const page = Number(req.query.page);

  if (req.query.page) {
    const { events, pagination } = getEventsPaginated({
      source,
      page,
      pageSize: Number(req.query.pageSize) || PAGE_SIZE,
    });
    return res.json({
      events,
      pagination,
      stats: storeStats(),
      sources: allSources(),
      config: { pageSize: PAGE_SIZE, historyPages: HISTORY_PAGES },
    });
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 90));
  res.json({
    events: getEvents({ source, limit }),
    stats: storeStats(),
    sources: allSources(),
    config: { pageSize: PAGE_SIZE, historyPages: HISTORY_PAGES },
  });
});

app.get("/api/top-offers", (req, res) => {
  const source = String(req.query.source || "all");
  const limit = Number(req.query.limit) || 8;
  res.json(getDailyTopOffers({ source, limit }));
});

app.get("/api/sources", (_req, res) => {
  res.json({ sources: allSources(), stats: getStats() });
});

app.get("/api/admin/offers", (req, res) => {
  const origin = originFromReq(req);
  res.json({
    offers: listCustomOffers().map((offer) => ({
      ...offer,
      postbackUrl: buildPostbackUrl(origin, offer),
      clickUrl: `${origin}/api/click/custom/${offer.id}?user_id={user_id}`,
    })),
  });
});

app.post("/api/admin/offers", async (req, res) => {
  const offer = await upsertCustomOffer(req.body || {});
  res.json({
    offer: {
      ...offer,
      postbackUrl: buildPostbackUrl(originFromReq(req), offer),
      clickUrl: `${originFromReq(req)}/api/click/custom/${offer.id}?user_id={user_id}`,
    },
  });
});

app.delete("/api/admin/offers/:id", async (req, res) => {
  const deleted = await deleteCustomOffer(String(req.params.id));
  res.json({ deleted });
});

app.get("/api/click/custom/:id", async (req, res) => {
  const result = await createCustomClick({
    offerId: String(req.params.id),
    userId: String(req.query.user_id || req.query.userId || "guest"),
    ip: req.ip || "",
  });
  if (!result) return res.status(404).send("Custom offer not found or inactive");
  if (!result.redirectUrl) {
    return res.json({
      click_id: result.click.id,
      offer_id: result.offer.id,
    });
  }
  res.redirect(result.redirectUrl);
});

app.get("/api/postback/custom", async (req, res) => {
  const result = await recordCustomPostback(req.query);
  if (!result.ok) {
    return res.status(result.status || 400).json({ ok: false, error: result.error });
  }
  if (result.event) {
    recordDailyImpressions("custom", [result.event]);
    const added = upsertMany([result.event]);
    broadcastNew(added);
    notifyTelegram(added).catch((err) => {
      console.warn(`[telegram] ${err instanceof Error ? err.message : String(err)}`);
    });
    await writePersistedState(exportStoreState());
    if (result.offer.externalPostbackUrl) {
      const url = result.offer.externalPostbackUrl
        .replaceAll("{offer_id}", encodeURIComponent(result.offer.id))
        .replaceAll("{click_id}", encodeURIComponent(result.conversion.clickId || ""))
        .replaceAll("{user_id}", encodeURIComponent(result.conversion.userId))
        .replaceAll("{amount}", encodeURIComponent(String(result.conversion.amount)))
        .replaceAll("{txid}", encodeURIComponent(result.conversion.txid));
      fetch(url).catch(() => {});
    }
  }
  res.json({
    ok: true,
    duplicate: !!result.duplicate,
    conversion_id: result.conversion.id,
  });
});

app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: "hello", data: getEvents({ limit: 50 }) })}\n\n`);

  const remove = addSseClient(res);
  req.on("close", () => {
    remove();
    res.end();
  });
});

app.get("*", (_req, res) => {
  res.sendFile(join(publicDir, "index.html"));
});

async function boot() {
  await loadCustomOfferState();
  const state = await readPersistedState();
  if (state?.events?.length) {
    hydrateStoreState(state);
    console.log(`[persist] loaded ${state.events.length} cached events`);
  }

  app.listen(PORT, () => {
    console.log(`Live Feed Hub → http://localhost:${PORT}`);
    console.log(`[telegram] ${telegramStatus()}`);
  });

  startPolling();
  startTelegramBot({
    getEvents,
    getDailyTopOffers,
    getSources: allSources,
    getStats: storeStats,
  });

  setInterval(() => {
    writePersistedState(exportStoreState()).catch(() => {});
  }, 60000);
}

boot().catch((err) => {
  console.error(err);
  process.exit(1);
});
