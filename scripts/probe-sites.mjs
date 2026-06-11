import { writeFileSync } from "fs";

const sites = [
  ["jjreward", "https://jjreward.com/"],
  ["earng", "https://earng.net/"],
  ["lunairo", "https://lunairo.com/"],
  ["gaincash", "http://gaincash.me/"],
  ["hogocash", "https://hogocash.com/"],
  ["jumptask", "https://jumptask.io/"],
];

const probes = [
  "/api/activity-ticker.json",
  "/api/live-feed",
  "/api/activity",
  "/system/ajax.php?a=liveFeed",
  "/Live.php",
  "/live.php",
  "/earn",
  "/api/v1/activity",
  "/api/recent-activity",
  "/graphql",
];

for (const [name, base] of sites) {
  console.log(`\n=== ${name} ${base}`);
  try {
    const r = await fetch(base, {
      headers: { "User-Agent": "Mozilla/5.0 Chrome/120" },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    const html = await r.text();
    console.log("status", r.status, "len", html.length, "final", r.url);
    for (const p of [
      "activity-ticker",
      "liveFeed",
      "user-List-CSM",
      "EARNG",
      "LiveFeed",
      "socket.io",
      "recentActivity",
      "live-feed",
      "ticker",
    ]) {
      if (html.includes(p)) console.log("  has", p);
    }
    writeFileSync(`tmp-${name}.html`, html.slice(0, 120000));
  } catch (e) {
    console.log("ERR", e.message);
  }
  for (const p of probes) {
    try {
      const u = new URL(p, base).href;
      const r = await fetch(u, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      const t = await r.text();
      if (t && t.length > 15 && r.status === 200 && !t.startsWith("<!"))
        console.log(" ", p, "->", t.slice(0, 120).replace(/\n/g, " "));
    } catch {}
  }
}
