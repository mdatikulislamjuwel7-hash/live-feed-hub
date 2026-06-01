import {
  netlifyFeed,
  netlifyStats,
  netlifyTopOffers,
  refreshNetlifyData,
} from "../../src/netlify-runtime.js";

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const url = new URL(event.rawUrl || `https://local${event.path || ""}`);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api\/?/, "/api/");

  if (path.startsWith("/api/stream")) {
    return {
      statusCode: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
      },
      body: `data: ${JSON.stringify({ type: "hello", data: [] })}\n\n`,
    };
  }

  try {
    await refreshNetlifyData({ force: url.searchParams.get("refresh") === "1" });
    if (path.startsWith("/api/sources")) return json(netlifyStats());
    if (path.startsWith("/api/top-offers")) return json(netlifyTopOffers(url.searchParams));
    if (path.startsWith("/api/feed")) return json(netlifyFeed(url.searchParams));
    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
