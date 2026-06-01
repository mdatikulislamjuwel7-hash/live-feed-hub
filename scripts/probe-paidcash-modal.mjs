import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 8000));

await page.click(".earnFeed-item");
await new Promise((r) => setTimeout(r, 2500));

const modal = await page.evaluate(() => {
  const el = document.querySelector("#user-details-modal.show, #user-details-modal.in, #user-details-modal[style*='display: block']") 
    || document.querySelector("#user-details-modal");
  if (!el) return { found: false };
  return {
    found: true,
    visible: el.classList.contains("show") || getComputedStyle(el).display !== "none",
    text: (el.innerText || "").slice(0, 1500),
    html: (el.innerHTML || "").slice(0, 2500),
  };
});

console.log(JSON.stringify(modal, null, 2));

await browser.close();
