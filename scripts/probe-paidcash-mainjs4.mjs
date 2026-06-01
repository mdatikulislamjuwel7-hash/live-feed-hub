const t = await (await fetch("https://paidcash.co/static/js/main.0ee1d1a4.js")).text();
const idx = t.indexOf("activityFeed");
console.log(t.slice(idx - 200, idx + 1200).replace(/\s+/g, " "));
