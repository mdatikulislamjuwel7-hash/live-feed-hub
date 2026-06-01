import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 10000));

const data = await page.evaluate(() => {
  const html = document.documentElement.innerHTML;
  const scripts = [...document.querySelectorAll("script")]
    .map((s) => s.textContent || "")
    .filter((t) => t.length > 50);
  const withOffer = scripts.filter((t) => t.includes("Watch More") || t.includes("MM Quiz"));
  const globals = Object.keys(window).filter((k) =>
    /user|modal|earn|feed|socket|io/i.test(k)
  );
  return {
    hasWatchMore: html.includes("Watch More"),
    hasMMQuiz: html.includes("MM Quiz"),
    scriptCount: scripts.length,
    withOfferLen: withOffer.map((s) => s.length),
    globals: globals.slice(0, 40),
    io: typeof window.io,
  };
});

console.log(JSON.stringify(data, null, 2));

// hover one and check if Watch More appears in html
const el = await page.$(".earnFeed-item");
const box = await el.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 1000));
const html2 = await page.content();
console.log("after hover Watch More", html2.includes("Watch More"));

await browser.close();
