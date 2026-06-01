import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const rows = await page.evaluate(() => {
  return [...document.querySelectorAll(".earnFeed-item")].slice(0, 8).map((item) => {
    const html = item._tippy?.props?.content || "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    const els = [...doc.querySelectorAll(".primary-feed-tooltip-el")].map((p) =>
      p.textContent.trim()
    );
    return {
      user: item.querySelector(".earning-feed-item-content-description")?.textContent?.trim(),
      wall: els[0],
      offer: els[1],
      amount: els[2],
    };
  });
});

console.log(JSON.stringify(rows, null, 2));

await browser.close();
