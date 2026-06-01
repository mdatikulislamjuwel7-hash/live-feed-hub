const t = await (await fetch("https://paidcash.co/static/js/main.0ee1d1a4.js")).text();
const needles = [
  "earning-feed",
  "earningFeed",
  "liveEarn",
  "earnFeed",
  "offername",
  "wall:",
  "CQ.connect",
  "io(",
];
for (const n of needles) {
  const idx = t.indexOf(n);
  if (idx < 0) {
    console.log(n, "NOT FOUND");
    continue;
  }
  // find nearby CQ.on or CQ.emit within 500 chars
  const chunk = t.slice(Math.max(0, idx - 400), idx + 400);
  const emits = chunk.match(/CQ\.(on|emit)\([^)]{0,80}/g) || [];
  console.log("\n==", n, "==", emits);
}
