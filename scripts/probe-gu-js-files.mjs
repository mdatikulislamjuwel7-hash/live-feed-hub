const paths = [
  "/assets/js/dashboard.js",
  "/assets/js/live.js",
  "/assets/js/completions.js",
  "/assets/js/earn.js",
  "/assets/js/app.js",
  "/assets/js/pages/live.js",
  "/page/assets/js/live.js",
  "/assets/js/live-completions.js",
];

for (const p of paths) {
  const r = await fetch(`https://gamersunivers.com${p}`);
  if (r.status !== 200) {
    console.log(p, r.status);
    continue;
  }
  const t = await r.text();
  const has =
    t.includes("Live Completions") ||
    t.includes("completion") ||
    t.includes("Tillamook");
  console.log(p, t.length, has ? "MATCH" : "");
  if (has) console.log(t.slice(0, 500));
}
