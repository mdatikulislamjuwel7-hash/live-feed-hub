const bases = [
  "https://jjreward.com",
  "https://hogocash.com",
  "https://lunairo.com",
  "https://jumptask.io",
  "https://app.jumptask.io",
];
const paths = [
  "/Live.php",
  "/live.php",
  "/api/activity-ticker.json",
  "/api/recent-withdrawals",
  "/api/live-activity",
  "/withdrawals/recent",
  "/earn/live",
  "/live-feed",
  "/recent-activity.json",
];

for (const base of bases) {
  for (const p of paths) {
    try {
      const r = await fetch(new URL(p, base), {
        headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      const t = await r.text();
      if (r.status === 200 && t.length > 30 && !t.startsWith("<!DOCTYPE") && !t.includes("<html")) {
        console.log(base + p, "->", t.slice(0, 120));
      }
    } catch {}
  }
}
