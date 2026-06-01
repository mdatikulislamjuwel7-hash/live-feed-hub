import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { startPolling, getSources, getStats, loadPersistedStore } from "./aggregator.js";
import {
  getEvents,
  getEventsPaginated,
  getDailyTopOffers,
  addSseClient,
  getStats as storeStats,
  PAGE_SIZE,
  HISTORY_PAGES,
} from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3847;
const publicDir = join(__dirname, "..", "public");

app.use(express.static(publicDir));

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
      sources: getSources(),
      config: { pageSize: PAGE_SIZE, historyPages: HISTORY_PAGES },
    });
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 90));
  res.json({
    events: getEvents({ source, limit }),
    stats: storeStats(),
    sources: getSources(),
    config: { pageSize: PAGE_SIZE, historyPages: HISTORY_PAGES },
  });
});

app.get("/api/top-offers", (req, res) => {
  const source = String(req.query.source || "all");
  const limit = Number(req.query.limit) || 8;
  res.json(getDailyTopOffers({ source, limit }));
});

app.get("/api/sources", (_req, res) => {
  res.json({ sources: getSources(), stats: getStats() });
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

app.listen(PORT, () => {
  console.log(`Live Feed Hub -> http://localhost:${PORT}`);
});

await loadPersistedStore();
startPolling();
