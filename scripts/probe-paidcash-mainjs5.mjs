const t = await (await fetch("https://paidcash.co/static/js/main.0ee1d1a4.js")).text();
let idx = 0;
while ((idx = t.indexOf("activityFeed", idx)) !== -1) {
  const chunk = t.slice(idx, idx + 80);
  if (chunk.includes("emit")) console.log("EMIT at", idx, t.slice(idx - 30, idx + 100));
  idx += 12;
}
