import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const hits = [];

page.on("response", async (res) => {
  const u = res.url();
  if (!/gamersunivers|live|feed|activity|socket|api/i.test(u)) return;
  let body = "";
  try {
    const ct = res.headers()["content-type"] || "";
    if (ct.includes("json") || ct.includes("text")) {
      body = (await res.text()).slice(0, 600);
    }
  } catch {}
  if (!body.startsWith("<!")) hits.push({ u, status: res.status(), body: body.slice(0, 400) });
});

await page.goto("https://gamersunivers.com/page/live.html", {
  waitUntil: "networkidle2",
  timeout: 90000,
});
await new Promise((r) => setTimeout(r, 10000));

const info = await page.evaluate(() => {
  const text = document.body.innerText.slice(0, 4000);
  const payoutRows = [...document.querySelectorAll("tr, [class*='payout'], [class*='live'], [class*='feed']")].slice(0, 15).map((el) => ({
    tag: el.tagName,
    cls: el.className?.toString?.().slice(0, 80),
    t: (el.innerText || "").slice(0, 120),
  }));
  return {
    textSample: text.slice(0, 1500),
    hasDE: text.includes("DE flag"),
    payoutRows: payoutRows.filter((r) => r.t.length > 5).slice(0, 8),
  };
});

console.log("info", JSON.stringify(info, null, 2));
console.log("network", JSON.stringify(hits.slice(0, 20), null, 2));

const html = await page.content();
for (const n of ["U5769752", "Recent Payout", "payout", "live-feed", "activity"]) {
  console.log(n, html.includes(n));
}

await browser.close();
