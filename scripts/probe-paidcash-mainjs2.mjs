const t = await (await fetch("https://paidcash.co/static/js/main.0ee1d1a4.js")).text();
const needles = [
  "getUserDetails",
  "userDetails",
  "earnFeed",
  "earningFeed",
  "liveFeed",
  "feedType",
  "offername",
  "CQ.emit",
  "CQ.on",
];
for (const n of needles) {
  let idx = 0;
  let nCount = 0;
  while ((idx = t.indexOf(n, idx)) !== -1 && nCount < 5) {
    console.log("\n---", n, idx, "---");
    console.log(t.slice(Math.max(0, idx - 80), idx + 180).replace(/\s+/g, " "));
    idx += n.length;
    nCount++;
  }
}
