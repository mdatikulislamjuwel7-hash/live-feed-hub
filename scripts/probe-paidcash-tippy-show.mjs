import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

const rows = await page.evaluate(async () => {
  const items = [...document.querySelectorAll(".earnFeed-item")].slice(0, 6);
  const out = [];
  for (const item of items) {
    if (item._tippy) item._tippy.show();
    else {
      item.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 300));
    const html = item._tippy?.props?.content || "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    const els = [...doc.querySelectorAll(".primary-feed-tooltip-el")].map((p) =>
      p.textContent.trim()
    );
    if (item._tippy) item._tippy.hide();
    out.push({ user: item.querySelector(".earning-feed-item-content-description")?.textContent?.trim(), els });
  }
  return out;
});

console.log(JSON.stringify(rows, null, 2));

await browser.close();
