const urls = [
  "https://gamersunivers.com/page/earn.html",
  "https://gamersunivers.com/page/login.html",
  "https://gamersunivers.com/index.php",
  "https://gamersunivers.com/page/index.php",
];

for (const url of urls) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const t = await r.text();
  console.log(
    url,
    r.status,
    t.length,
    "Live Completions",
    t.includes("Live Completions"),
    "Tillamook",
    t.includes("Tillamook")
  );
  if (t.includes("Live Completions")) {
    const i = t.indexOf("Live Completions");
    console.log(t.slice(i, i + 800));
  }
}
