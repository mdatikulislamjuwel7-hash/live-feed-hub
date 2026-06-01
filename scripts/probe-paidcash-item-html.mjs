import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const items = await page.evaluate(() => {
  return [...document.querySelectorAll(".earnFeed-item")].slice(0, 3).map((item) => ({
    id: item.id,
    outer: item.outerHTML.slice(0, 1200),
    attrs: Object.fromEntries([...item.attributes].map((a) => [a.name, a.value])),
  }));
});

console.log(JSON.stringify(items, null, 2));

await browser.close();
