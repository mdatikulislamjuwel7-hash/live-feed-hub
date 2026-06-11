const r = await fetch("https://joker-cash.com/main.dart.js", {
  headers: { "User-Agent": "Mozilla/5.0" },
});
const t = await r.text();
console.log("dart size", t.length);
for (const needle of ["livefeed", "live_feed", "recentEarn", "activity", "/api/", "supabase", "firebase"]) {
  const idx = t.toLowerCase().indexOf(needle.toLowerCase());
  if (idx >= 0) console.log(needle, "at", idx, t.slice(idx, idx + 80));
}

const paths = [
  "https://joker-cash.com/api/live",
  "https://joker-cash.com/api/feed",
  "https://joker-cash.com/api/activities",
  "https://api.joker-cash.com/live",
];
for (const url of paths) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
    console.log(url, res.status, (await res.text()).slice(0, 80));
  } catch (e) {
    console.log(url, e.message);
  }
}
