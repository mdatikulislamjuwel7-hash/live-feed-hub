import puppeteer from "puppeteer";
import { writeFileSync } from "fs";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto("https://paidcash.co", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".earnFeed-item", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 10000));

let html = await page.content();
const modalIdx = html.indexOf('id="user-details-modal"');
console.log("modal element idx", modalIdx);
if (modalIdx >= 0) console.log(html.slice(modalIdx, modalIdx + 800));

const el = await page.$(".earnFeed-item");
const box = await el.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await new Promise((r) => setTimeout(r, 5000));

html = await page.content();
const modalIdx2 = html.indexOf('id="user-details-modal"');
console.log("after click modal idx", modalIdx2);
if (modalIdx2 >= 0) console.log(html.slice(modalIdx2, modalIdx2 + 1200));

const visible = await page.evaluate(() => {
  const m = document.getElementById("user-details-modal");
  if (!m) return { found: false };
  return {
    found: true,
    className: m.className,
    display: getComputedStyle(m).display,
    text: m.innerText.slice(0, 1200),
  };
});
console.log("visible", JSON.stringify(visible, null, 2));

await browser.close();
