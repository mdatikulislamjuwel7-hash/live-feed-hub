import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const hits = [];

page.on("response", async (res) => {
  const u = res.url();
  if (!/gamersunivers/i.test(u)) return;
  const ct = res.headers()["content-type"] || "";
  if (!ct.includes("json") && !/api|payout|live|feed|earn/i.test(u)) return;
  let body = "";
  try {
    body = (await res.text()).slice(0, 800);
  } catch {}
  hits.push({ u, ct: ct.slice(0, 40), body: body.slice(0, 500) });
});

await page.goto("https://gamersunivers.com/page/live.html", {
  waitUntil: "domcontentloaded",
});
await new Promise((r) => setTimeout(r, 15000));

const payouts = await page.evaluate(() => {
  return [...document.querySelectorAll(".payout-item")].map((el) => ({
    html: el.innerHTML.slice(0, 400),
    text: el.innerText.replace(/\s+/g, " ").trim(),
  }));
});

console.log("payouts", JSON.stringify(payouts, null, 2));
console.log("api", JSON.stringify(hits.filter((h) => h.body && !h.body.startsWith("<")), null, 2));

await browser.close();
