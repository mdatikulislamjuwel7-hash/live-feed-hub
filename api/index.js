import {
  netlifyFeed,
  netlifyStats,
  netlifyTopOffers,
  refreshNetlifyData,
} from "../src/netlify-runtime.js";

function send(res, body, statusCode = 200, headers = {}) {
  res.statusCode = statusCode;
  for (const [key, value] of Object.entries({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  })) {
    res.setHeader(key, value);
  }
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

export default async function handler(req, res) {
  const url = new URL(req.url || "/api/feed", "https://local.vercel");
  const path = url.pathname.replace(/^\/api\/?/, "/api/");

  if (path.startsWith("/api/stream")) {
    await refreshNetlifyData({ force: true });
    const payload = netlifyFeed(new URLSearchParams({ limit: "50" }));
    res.statusCode = 200;
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(`data: ${JSON.stringify({ type: "hello", data: payload.events })}\n\n`);
    return;
  }

  try {
    await refreshNetlifyData({ force: url.searchParams.get("refresh") === "1" });
    if (path.startsWith("/api/sources")) return send(res, netlifyStats());
    if (path.startsWith("/api/top-offers")) return send(res, netlifyTopOffers(url.searchParams));
    if (path.startsWith("/api/feed")) return send(res, netlifyFeed(url.searchParams));
    return send(res, { error: "Not found" }, 404);
  } catch (err) {
    return send(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
}
