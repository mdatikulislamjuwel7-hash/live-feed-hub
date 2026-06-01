import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "networkidle2", timeout: 90000 });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 5000));

const g = await page.evaluate(() => {
  const keys = Object.keys(window).filter((k) =>
    /^[A-Z]{1,3}$/.test(k) || /socket|CQ|emit|feed/i.test(k)
  );
  return {
    keys: keys.slice(0, 50),
    ioType: typeof window.io,
    hasCQ: typeof window.CQ,
    custom: typeof window.showUserID,
  };
});

console.log(JSON.stringify(g, null, 2));

await browser.close();
