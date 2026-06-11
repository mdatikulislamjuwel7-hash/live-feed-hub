import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setUserAgent(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
);
await page.goto("https://joker-cash.com/", { waitUntil: "networkidle0", timeout: 90000 });
await new Promise((r) => setTimeout(r, 15000));
const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log(text);
const reqs = await page.evaluate(() =>
  performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => u.includes("firestore") || u.includes("googleapis") || u.includes("firebase"))
);
console.log("firebase reqs", reqs.slice(0, 15));
await browser.close();
