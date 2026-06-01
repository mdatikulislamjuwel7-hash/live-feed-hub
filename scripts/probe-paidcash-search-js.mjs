const t = await (await fetch("https://asp-assets.b-cdn.net/lib/index.js")).text();
const needles = [
  "user-details",
  "userDetails",
  "Country",
  "country",
  "earnFeed",
  "feed-tooltip",
  "data-user",
  "openProfile",
];
for (const n of needles) {
  const i = t.indexOf(n);
  console.log(n, i >= 0 ? t.slice(Math.max(0, i - 60), i + 120).replace(/\s+/g, " ") : "no");
}
