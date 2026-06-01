const pages = [
  "live.html",
  "live.php",
  "dashboard.php",
  "home.php",
  "index.php",
  "earn.php",
  "completions.php",
  "live-completions.php",
  "ajax/live-completions.php",
  "api/live-completions.php",
];

for (const p of pages) {
  const url = `https://gamersunivers.com/page/${p}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const t = await r.text();
  const lc = t.includes("Live Completions");
  const off = t.includes("Offery");
  console.log(p, r.status, t.length, lc ? "LIVE_COMP" : "", off ? "OFFERY" : "");
}
