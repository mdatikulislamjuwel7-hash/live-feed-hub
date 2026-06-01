const r = await fetch("https://paidcash.co/", {
  headers: { "User-Agent": "Mozilla/5.0" },
});
const t = await r.text();
console.log("len", t.length);
for (const n of [
  "earnFeed",
  "Watch More",
  "user-details",
  "primary-feed-tooltip",
  "/api/",
]) {
  console.log(n, t.includes(n));
}
const m = t.match(/https:\/\/[^"']+\.js/g) || [];
console.log("js", [...new Set(m)].slice(0, 20));
