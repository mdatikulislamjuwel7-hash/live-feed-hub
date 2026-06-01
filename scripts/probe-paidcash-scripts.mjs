import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const scripts = await page.evaluate(() =>
  [...document.querySelectorAll("script[src]")].map((s) => s.src)
);
console.log("scripts", scripts);

await browser.close();
