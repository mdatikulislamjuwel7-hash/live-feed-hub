const candidates = [
  "https://cashinstyle.com/api/activity-ticker.json",
  "https://gain.gg/api/activity-ticker.json",
  "https://freecash.com/api/activity-ticker.json",
  "https://www.freecash.com/api/activity-ticker.json",
  "https://earnlab.com/api/activity-ticker.json",
  "https://rewards1.com/api/activity-ticker.json",
  "https://prizerebel.com/api/activity-ticker.json",
  "https://timebucks.com/api/activity-ticker.json",
  "https://idle-empire.com/api/activity-ticker.json",
];

for (const url of candidates) {
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const t = await r.text();
    const ok = r.ok && t.trim().startsWith("[");
    console.log(ok ? "OK " : "NO ", url);
  } catch {
    console.log("ERR", url);
  }
}
