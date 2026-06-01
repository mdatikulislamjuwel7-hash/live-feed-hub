import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const results = await page.evaluate(async () => {
  const items = [...document.querySelectorAll(".earnFeed-item")].slice(0, 5);
  const out = [];
  for (const item of items) {
    item.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const tip = document.querySelector(".feed-tooltip");
    const els = tip
      ? [...tip.querySelectorAll(".primary-feed-tooltip-el")].map((p) =>
          p.textContent.trim()
        )
      : [];
    out.push({
      user: item.querySelector(".earning-feed-item-content-description")?.textContent?.trim(),
      tip: els,
      wall: els[0],
      offer: els[1],
      amount: els[2],
    });
    item.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  }
  return out;
});

console.log(JSON.stringify(results, null, 2));

await browser.close();
