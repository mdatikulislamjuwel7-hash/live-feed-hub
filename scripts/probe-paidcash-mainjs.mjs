const url = "https://paidcash.co/static/js/main.0ee1d1a4.js";
const t = await (await fetch(url)).text();
console.log("len", t.length);
const needles = [
  "user-details-modal",
  "userDetails",
  "earnFeed",
  "feed-tooltip",
  "primary-feed-tooltip",
  "country",
  "Country",
  "data-user",
  "/api/",
];
for (const n of needles) {
  let idx = 0;
  let count = 0;
  while ((idx = t.indexOf(n, idx)) !== -1 && count < 3) {
    console.log("\n---", n, "at", idx, "---");
    console.log(t.slice(idx, idx + 200).replace(/\s+/g, " "));
    idx += n.length;
    count++;
  }
  if (count === 0) console.log(n, "NOT FOUND");
}
