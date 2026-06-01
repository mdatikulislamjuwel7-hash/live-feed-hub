import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const hits = [];
page.on("response", async (res) => {
  const u = res.url();
  if (!/user|profile|country|earn|feed/i.test(u)) return;
  let body = "";
  try {
    const ct = res.headers()["content-type"] || "";
    if (ct.includes("json") || ct.includes("text")) {
      body = (await res.text()).slice(0, 500);
    }
  } catch {}
  hits.push({ u, status: res.status(), body });
});

await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const item = await page.$(".earnFeed-item");
const userId = await page.evaluate((el) => el?.getAttribute("data-user"), item);
console.log("userId", userId);

await page.click(".earnFeed-item");
await new Promise((r) => setTimeout(r, 4000));

console.log("network", JSON.stringify(hits.slice(-20), null, 2));

const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
console.log("body has country?", /country|Country|Germany|United/i.test(bodyText));
const countryMatch = bodyText.match(/Country[^\n]*/gi);
console.log("country lines", countryMatch?.slice(0, 5));

await browser.close();
