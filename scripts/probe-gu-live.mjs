import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const hits = [];

page.on("response", async (res) => {
  const u = res.url();
  if (!/gamersunivers|completion|live|offer|api/i.test(u)) return;
  let body = "";
  try {
    const ct = res.headers()["content-type"] || "";
    if (ct.includes("json") || /api|completion/i.test(u)) {
      body = (await res.text()).slice(0, 1000);
    }
  } catch {}
  if (body && !body.startsWith("<!DOCTYPE")) {
    hits.push({ u, body });
  }
});

const urls = [
  "https://gamersunivers.com/page/live.html",
  "https://gamersunivers.com/page/live-completions.html",
  "https://gamersunivers.com/live",
  "https://gamersunivers.com/dashboard",
];

for (const url of urls) {
  try {
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    console.log(url, r?.status());
    const has = await page.evaluate(() => ({
      title: document.title,
      hasLiveCompletions: document.body.innerText.includes("Live Completions"),
      hasOffery: document.body.innerText.includes("Offery"),
      hasTillamook: document.body.innerText.includes("Tillamook"),
      text: document.body.innerText.slice(0, 800),
    }));
    console.log(JSON.stringify(has, null, 2));
  } catch (e) {
    console.log(url, "err", e.message);
  }
}

console.log("json hits", JSON.stringify(hits.slice(0, 15), null, 2));
await browser.close();
